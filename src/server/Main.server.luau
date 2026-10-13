--[[
	왁뿌볼 던지기 — 서버
	던지기 → 속도 +1 → 적 처치 → 출구에서 귀환(Stop) / 전진(Go) → 죽으면 미수령 트로피 전부 상실
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local World = require(script.Parent:WaitForChild("World"))
local Data = require(script.Parent:WaitForChild("Data"))

Players.RespawnTime = 3
Lighting.ClockTime = 14

-- 서버 ↔ 클라이언트 통신 -----------------------------------------------------

local remotes = Instance.new("Folder")
remotes.Name = "Remotes"

local function newRemote(name)
	local remote = Instance.new("RemoteEvent")
	remote.Name = name
	remote.Parent = remotes
	return remote
end

local ThrowRemote = newRemote("Throw") -- 클라 → 서버: 던지기
local ActionRemote = newRemote("Action") -- 클라 → 서버: 귀환/전진, 강화, 환생
local ThrowFx = newRemote("ThrowFx") -- 서버 → 모두: 볼 날아가는 연출
local Notify = newRemote("Notify") -- 서버 → 클라: 레벨업, 클리어, 사망 등
remotes.Parent = ReplicatedStorage

local lobby = World.BuildLobby()

local states = {} -- [player] = { data, lastThrow, run }
local slots = {} -- 스테이지를 지을 자리 [번호] = player

-- 값 바꾸기: 상태 + 플레이어 속성 + 리더보드를 한 번에 맞춥니다 ------------------

local LEADERSTATS = {
	Trophies = "트로피",
	Level = "레벨",
	BestStage = "최고 스테이지",
}

local function set(player, state, key, value)
	state.data[key] = value
	player:SetAttribute(key, value)
	local statName = LEADERSTATS[key]
	if statName then
		local leaderstats = player:FindFirstChild("leaderstats")
		local stat = leaderstats and leaderstats:FindFirstChild(statName)
		if stat then
			stat.Value = math.min(value, 2 ^ 53)
		end
	end
end

local function getCharacterParts(player)
	local character = player.Character
	if not character then
		return nil, nil
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not root or not humanoid or humanoid.Health <= 0 then
		return nil, nil
	end
	return root, humanoid
end

local function toast(player, text, color)
	Notify:FireClient(player, "toast", { text = text, color = color })
end

local function applyLevelStats(player, state)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	local ratio = humanoid.Health / humanoid.MaxHealth
	humanoid.MaxHealth = Config.MaxHealth(state.data.Level)
	humanoid.Health = humanoid.MaxHealth * ratio
	humanoid.WalkSpeed = Config.WalkSpeed(state.data.Level)
end

local function addSpeed(player, state, amount)
	set(player, state, "Speed", state.data.Speed + amount)
	local newLevel = Config.LevelFromSpeed(state.data.Speed)
	if newLevel ~= state.data.Level then
		local leveledUp = newLevel > state.data.Level
		set(player, state, "Level", newLevel)
		applyLevelStats(player, state)
		if leveledUp then
			Notify:FireClient(player, "levelUp", { level = newLevel })
		end
	end
end

-- 스테이지 진행 ---------------------------------------------------------------

local function teleport(player, cframe)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root then
		root.AssemblyLinearVelocity = Vector3.zero
		character:PivotTo(cframe)
	end
end

local function clearRun(player, state)
	local run = state.run
	if not run then
		return
	end
	state.run = nil
	if run.map then
		run.map.folder:Destroy()
	end
	slots[run.slot] = nil
	set(player, state, "Stage", 0)
	set(player, state, "EnemiesLeft", 0)
end

local buildStage

local function onExitTouched(player, run, stage, hit)
	local state = states[player]
	local character = player.Character
	if not state or state.run ~= run or not run.map or run.map.stage ~= stage then
		return
	end
	if not character or not hit:IsDescendantOf(character) then
		return
	end
	if not run.exitOpen or run.awaitingChoice then
		return
	end
	run.awaitingChoice = true

	local reward = Config.StageReward(stage)
	set(player, state, "Unbanked", state.data.Unbanked + reward)
	if stage > state.data.BestStage then
		set(player, state, "BestStage", stage)
	end

	local canGo = stage < Config.StagesPerWorld
	Notify:FireClient(player, "cleared", {
		stage = stage,
		reward = reward,
		unbanked = state.data.Unbanked,
		canGo = canGo,
		nextStage = canGo and stage + 1 or nil,
		nextRecommended = canGo and Config.RecommendedLevel(stage + 1) or nil,
	})
end

function buildStage(player, state, stage)
	local run = state.run
	if run.map then
		run.map.folder:Destroy()
	end
	local map = World.BuildStage(run.origin, stage, player.Name)
	run.map = map
	run.alive = #map.enemies
	run.exitOpen = false
	run.awaitingChoice = false

	map.exitPad.Touched:Connect(function(hit)
		onExitTouched(player, run, stage, hit)
	end)

	set(player, state, "Stage", stage)
	set(player, state, "EnemiesLeft", run.alive)
	teleport(player, map.startCFrame)
	Notify:FireClient(player, "stageStart", {
		stage = stage,
		recommended = Config.RecommendedLevel(stage),
	})
end

local function startRun(player, state)
	if state.run then
		return
	end
	local root = getCharacterParts(player)
	if not root then
		return
	end
	local slot = 1
	while slots[slot] do
		slot += 1
	end
	slots[slot] = player
	state.run = {
		slot = slot,
		origin = Vector3.new(slot * 1000, 300, 0),
	}
	set(player, state, "Unbanked", 0)
	buildStage(player, state, 1)
end

local function bankAndReturn(player, state)
	local amount = state.data.Unbanked
	set(player, state, "Trophies", state.data.Trophies + amount)
	set(player, state, "Unbanked", 0)
	clearRun(player, state)
	teleport(player, lobby.spawnCFrame)
	Notify:FireClient(player, "banked", { amount = amount })
end

local function onDied(player)
	local state = states[player]
	if not state or not state.run then
		return
	end
	local lost = state.data.Unbanked
	local stage = state.run.map and state.run.map.stage or 0
	set(player, state, "Unbanked", 0)
	clearRun(player, state)
	Notify:FireClient(player, "death", { lost = lost, stage = stage })
end

-- 던지기 ---------------------------------------------------------------------

local function findTarget(run, position)
	if not run or not run.map then
		return nil
	end
	local best, bestDistance = nil, Config.ThrowRange
	for _, enemy in ipairs(run.map.enemies) do
		if not enemy.dead then
			local distance = (enemy.part.Position - position).Magnitude
			if distance <= bestDistance then
				best, bestDistance = enemy, distance
			end
		end
	end
	return best
end

local function damageEnemy(player, state, enemy, damage)
	local run = state.run
	enemy.health -= damage
	World.UpdateEnemyBar(enemy)
	if enemy.health > 0 or enemy.dead then
		return
	end
	enemy.dead = true
	World.KillEnemy(enemy)
	run.alive -= 1
	set(player, state, "EnemiesLeft", run.alive)
	World.UpdateGate(run.map, run.alive)
	if run.alive <= 0 then
		run.exitOpen = true
		Notify:FireClient(player, "exitOpen", {})
	end
end

ThrowRemote.OnServerEvent:Connect(function(player)
	local state = states[player]
	if not state then
		return
	end
	local root = getCharacterParts(player)
	if not root then
		return
	end

	-- 공속보다 빠른 요청은 무시 (오토클릭/해킹 방지)
	local now = os.clock()
	local interval = 1 / Config.ThrowsPerSecond(state.data.Speed)
	if now - state.lastThrow < interval * 0.85 then
		return
	end
	state.lastThrow = now

	local gain = Config.GainPerThrow(state.data)
	addSpeed(player, state, gain)

	local from = root.Position + Vector3.new(0, 1.5, 0)
	local target = findTarget(state.run, root.Position)
	if target then
		local damage = Config.Damage(state.data.Speed)
		ThrowFx:FireAllClients(player, from, target.part.Position, damage, gain)
		damageEnemy(player, state, target, damage)
	else
		local landing = from + root.CFrame.LookVector * 30 - Vector3.new(0, 3, 0)
		ThrowFx:FireAllClients(player, from, landing, nil, gain)
	end
end)

ActionRemote.OnServerEvent:Connect(function(player, action, arg)
	local state = states[player]
	if not state or type(action) ~= "string" then
		return
	end
	local data = state.data

	if action == "choice" then
		local run = state.run
		if not run or not run.awaitingChoice then
			return
		end
		if arg == "go" and run.map.stage < Config.StagesPerWorld then
			buildStage(player, state, run.map.stage + 1)
		elseif arg == "stop" then
			bankAndReturn(player, state)
		end
	elseif action == "upgrade" then
		local cost = Config.UpgradeCost(data.BallUpgrade)
		if data.Trophies < cost then
			toast(player, "트로피가 부족해요!", Color3.fromRGB(255, 120, 120))
			return
		end
		set(player, state, "Trophies", data.Trophies - cost)
		set(player, state, "BallUpgrade", data.BallUpgrade + 1)
		toast(
			player,
			Config.BallName .. " 강화! 던질 때 속도 +" .. Config.GainPerThrow(data),
			Color3.fromRGB(120, 230, 255)
		)
	elseif action == "rebirth" then
		if state.run then
			toast(player, "환생은 로비에서만 할 수 있어요", Color3.fromRGB(255, 120, 120))
			return
		end
		local need = Config.RebirthLevel(data.Rebirths)
		if data.Level < need then
			toast(player, "레벨 " .. need .. "이 필요해요", Color3.fromRGB(255, 120, 120))
			return
		end
		set(player, state, "Rebirths", data.Rebirths + 1)
		set(player, state, "Speed", 0)
		set(player, state, "Level", 1)
		applyLevelStats(player, state)
		Notify:FireClient(player, "rebirth", {
			rebirths = data.Rebirths,
			multiplier = Config.RebirthMultiplier(data.Rebirths),
		})
	end
end)

-- 출발 포털 ------------------------------------------------------------------

lobby.portal.Touched:Connect(function(hit)
	local player = Players:GetPlayerFromCharacter(hit.Parent)
	local state = player and states[player]
	if state and not state.run then
		startRun(player, state)
	end
end)

-- 적 움직임과 공격 (매 프레임) -------------------------------------------------

local function updateEnemy(enemy, root, humanoid, map, player, dt, now)
	local position = enemy.part.Position
	local toPlayer = root.Position - position
	local flat = Vector3.new(toPlayer.X, 0, toPlayer.Z)
	local distance = flat.Magnitude
	if distance > Config.EnemyAggroRange or distance < 0.01 then
		return
	end

	local direction = flat.Unit
	local reach = enemy.radius + 2
	local newPosition = position
	if distance > reach then
		newPosition = position + direction * math.min(enemy.speed * dt, distance - reach)
		local bounds = map.bounds
		local margin = enemy.radius
		newPosition = Vector3.new(
			math.clamp(newPosition.X, bounds.minX + margin, bounds.maxX - margin),
			enemy.baseY + math.abs(math.sin(now * 8 + enemy.bobOffset)) * 0.8,
			math.clamp(newPosition.Z, bounds.minZ + margin, bounds.maxZ - margin)
		)
	end
	enemy.part.CFrame = CFrame.lookAt(newPosition, newPosition + direction)

	if distance <= reach + 1 and math.abs(toPlayer.Y) < 10 and now - enemy.lastAttack >= Config.EnemyAttackCooldown then
		enemy.lastAttack = now
		humanoid:TakeDamage(enemy.damage)
		Notify:FireClient(player, "hurt", { damage = enemy.damage })
	end
end

RunService.Heartbeat:Connect(function(dt)
	local now = os.clock()
	for player, state in pairs(states) do
		local run = state.run
		if run and run.map then
			local root, humanoid = getCharacterParts(player)
			if root then
				if root.Position.Y < run.origin.Y - 40 then
					humanoid.Health = 0 -- 길에서 떨어짐
				else
					for _, enemy in ipairs(run.map.enemies) do
						if not enemy.dead then
							updateEnemy(enemy, root, humanoid, run.map, player, dt, now)
						end
					end
				end
			end
		end
	end
end)

-- 훈련 허수아비: 노란 원 안에 서 있으면 자동으로 던집니다 ---------------------------

task.spawn(function()
	while true do
		task.wait(1 / Config.DummyThrowsPerSecond)
		for player, state in pairs(states) do
			if not state.run then
				local root = getCharacterParts(player)
				if root then
					local offset = root.Position - lobby.dummy.Position
					if Vector3.new(offset.X, 0, offset.Z).Magnitude <= Config.DummyRange then
						local gain = Config.GainPerThrow(state.data) * Config.DummyMultiplier
						addSpeed(player, state, gain)
						ThrowFx:FireAllClients(player, root.Position + Vector3.new(0, 1.5, 0), lobby.dummy.Position, nil, gain)
					end
				end
			end
		end
	end
end)

-- 플레이어 입장/퇴장 -----------------------------------------------------------

local function onCharacterAdded(player, character)
	local humanoid = character:WaitForChild("Humanoid")
	humanoid.Died:Connect(function()
		onDied(player)
	end)
	local state = states[player]
	if state then
		applyLevelStats(player, state)
		humanoid.Health = humanoid.MaxHealth
	end
end

local function onPlayerAdded(player)
	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)

	local data = Data.Load(player)
	if not player.Parent then
		return
	end
	data.Level = Config.LevelFromSpeed(data.Speed)
	data.Unbanked = 0
	data.Stage = 0
	data.EnemiesLeft = 0

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	for _, key in ipairs({ "Trophies", "Level", "BestStage" }) do
		local value = Instance.new("IntValue")
		value.Name = LEADERSTATS[key]
		value.Value = data[key]
		value.Parent = leaderstats
	end
	leaderstats.Parent = player

	local state = { data = data, lastThrow = 0, run = nil }
	states[player] = state
	for key, value in pairs(data) do
		player:SetAttribute(key, value)
	end
	player:SetAttribute("Ready", true)

	if player.Character then
		applyLevelStats(player, state)
	end
end

local function onPlayerRemoving(player)
	local state = states[player]
	if not state then
		return
	end
	clearRun(player, state)
	states[player] = nil
	Data.Save(player, state.data)
	Data.Release(player)
end

for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
	if player.Character then
		task.spawn(onCharacterAdded, player, player.Character)
	end
end
Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)

-- 2분마다 자동 저장
task.spawn(function()
	while true do
		task.wait(120)
		for player, state in pairs(states) do
			task.spawn(Data.Save, player, state.data)
		end
	end
end)

game:BindToClose(function()
	if RunService:IsStudio() then
		task.wait(1)
	end
	for player, state in pairs(states) do
		Data.Save(player, state.data)
	end
end)
