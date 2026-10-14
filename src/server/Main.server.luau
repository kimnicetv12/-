--[[
	왁뿌볼 던지기 — 서버
	던지기 → 속도 → 적 처치 → 안전지대에서 귀환(노란 발판) / 전진(초록 포털) → 죽으면 미수령 트로피 상실
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")
local MessagingService = game:GetService("MessagingService")
local Lighting = game:GetService("Lighting")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Format = require(Shared:WaitForChild("Format"))
local World = require(script.Parent:WaitForChild("World"))
local Data = require(script.Parent:WaitForChild("Data"))
local Passes = require(script.Parent:WaitForChild("Passes"))

Players.RespawnTime = 3
Lighting.ClockTime = 14

-- 서버 ↔ 클라이언트 통신 ----------------------------------------------------------

local remotes = Instance.new("Folder")
remotes.Name = "Remotes"

local function newRemote(name)
	local remote = Instance.new("RemoteEvent")
	remote.Name = name
	remote.Parent = remotes
	return remote
end

local ThrowRemote = newRemote("Throw") -- 클라 → 서버: 던지기
local ActionRemote = newRemote("Action") -- 클라 → 서버: 상점, 환생, 텔레포트, 코드, 선물
local ThrowFx = newRemote("ThrowFx") -- 서버 → 모두: 볼 날아가는 연출
local Notify = newRemote("Notify") -- 서버 → 클라: 알림
remotes.Parent = ReplicatedStorage

workspace:SetAttribute("EventMult", 1)
workspace:SetAttribute("EventEnds", 0)

local lobby = World.BuildLobby()

local states = {} -- [player] = { data, lastThrow, run, cooldowns }
local slots = {} -- 스테이지를 지을 자리 [번호] = player

-- 상태 동기화 -----------------------------------------------------------------------

local function updateLeaderstats(player, state)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return
	end
	leaderstats["⚡ 속도"].Value = Format.Short(state.data.Speed)
	leaderstats["🏆 트로피"].Value = Format.Short(state.data.Trophies)
	leaderstats["🔁 환생"].Value = state.data.Rebirths
end

-- 숫자/문자 값: 상태와 플레이어 속성을 함께 바꿉니다
local function set(player, state, key, value)
	state.data[key] = value
	player:SetAttribute(key, value)
	if key == "Speed" or key == "Trophies" or key == "Rebirths" then
		updateLeaderstats(player, state)
	end
end

-- 표(목록) 값: JSON 글자로 바꿔서 속성에 넣습니다 (예: SkinsJson)
local function syncTable(player, state, key)
	player:SetAttribute(key .. "Json", HttpService:JSONEncode(state.data[key]))
end

local function syncPasses(player)
	player:SetAttribute("PassesJson", HttpService:JSONEncode(Passes.Get(player)))
end

local function eventMultiplier()
	if workspace:GetAttribute("EventEnds") > os.time() then
		return workspace:GetAttribute("EventMult")
	end
	return 1
end

local function speedContext(player, state)
	local data = state.data
	return {
		pad = data.Pad,
		rebirths = data.Rebirths,
		skin = data.Skin,
		aura = data.Aura,
		doubleSpeed = Passes.Owns(player, "DoubleSpeed"),
		eventMult = eventMultiplier(),
	}
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

-- 같은 일이 너무 자주 일어나지 않게 (발판 위에 서 있을 때 알림이 쏟아지는 것 방지)
local function ready(state, key, seconds)
	local now = os.clock()
	if (state.cooldowns[key] or 0) > now then
		return false
	end
	state.cooldowns[key] = now + seconds
	return true
end

local RED = Color3.fromRGB(255, 120, 120)
local GOLD = Color3.fromRGB(255, 214, 90)
local CYAN = Color3.fromRGB(120, 230, 255)

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

-- 오라: 캐릭터 주변에 반짝이는 입자
local function applyAura(player, state)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end
	local old = root:FindFirstChild("AuraFx")
	if old then
		old:Destroy()
	end
	local aura = Config.FindById(Config.Auras, state.data.Aura)
	if not aura then
		return
	end
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = "AuraFx"
	emitter.Color = ColorSequence.new(aura.color)
	emitter.LightEmission = 1
	emitter.Rate = 25
	emitter.Lifetime = NumberRange.new(0.8, 1.4)
	emitter.Speed = NumberRange.new(1.5, 3)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.6), NumberSequenceKeypoint.new(1, 0) })
	emitter.Transparency = NumberSequence.new(0.2)
	emitter.Parent = root
end

-- 스테이지 진행 -----------------------------------------------------------------------

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
	-- Stage를 먼저 0으로: 화면은 Stage > 0일 때만 World를 읽습니다
	set(player, state, "Stage", 0)
	set(player, state, "World", 0)
	set(player, state, "EnemiesLeft", 0)
end

local function bankAndReturn(player, state)
	local amount = state.data.Unbanked
	if Passes.Owns(player, "DoubleTrophies") then
		amount *= 2
	end
	set(player, state, "Trophies", state.data.Trophies + amount)
	set(player, state, "Unbanked", 0)
	clearRun(player, state)
	teleport(player, lobby.spawnCFrame)
	Notify:FireClient(player, "banked", { amount = amount })
end

local buildStage

local function onSafeZoneTouched(player, run, stage, hit, goNext)
	local state = states[player]
	local character = player.Character
	if not state or state.run ~= run or not run.map or run.map.stage ~= stage then
		return
	end
	if not character or not hit:IsDescendantOf(character) or not run.exitOpen or run.leaving then
		return
	end
	run.leaving = true
	if goNext then
		buildStage(player, state, run.map.world, stage + 1)
	else
		bankAndReturn(player, state)
	end
end

function buildStage(player, state, world, stage)
	local run = state.run
	if run.map then
		run.map.folder:Destroy()
	end
	local map = World.BuildStage(run.origin, world, stage, player.Name)
	run.map = map
	run.alive = #map.enemies
	run.exitOpen = false
	run.leaving = false

	map.bankPad.Touched:Connect(function(hit)
		onSafeZoneTouched(player, run, stage, hit, false)
	end)
	if map.nextPortal then
		map.nextPortal.Touched:Connect(function(hit)
			onSafeZoneTouched(player, run, stage, hit, true)
		end)
	end

	set(player, state, "World", world)
	set(player, state, "Stage", stage)
	set(player, state, "EnemiesLeft", run.alive)
	teleport(player, map.startCFrame)
	Notify:FireClient(player, "stageStart", {
		world = world,
		stage = stage,
		recommended = Config.RecommendedLevel(world, stage),
	})
end

local function startRun(player, state, world, stage)
	if state.run then
		return
	end
	if not getCharacterParts(player) then
		return
	end
	local slot = 1
	while slots[slot] do
		slot += 1
	end
	slots[slot] = player
	state.run = { slot = slot, origin = Vector3.new(slot * 1000, 300, 0) }
	set(player, state, "Unbanked", 0)
	buildStage(player, state, world, stage)
end

local function onStageCleared(player, state)
	local run = state.run
	local world, stage = run.map.world, run.map.stage
	run.exitOpen = true

	local reward = Config.StageReward(world, stage)
	set(player, state, "Unbanked", state.data.Unbanked + reward)
	if stage > state.data.BestStages[world] then
		state.data.BestStages[world] = stage
		syncTable(player, state, "BestStages")
	end

	local isLast = stage >= Config.StagesPerWorld
	Notify:FireClient(player, "cleared", {
		world = world,
		stage = stage,
		reward = reward,
		unbanked = state.data.Unbanked,
		isLast = isLast,
		nextRecommended = not isLast and Config.RecommendedLevel(world, stage + 1) or nil,
	})

	-- 월드 보스를 처음 잡으면 전용 스킨
	if isLast then
		for _, skin in ipairs(Config.Skins) do
			if skin.boss == world and not state.data.Skins[skin.id] then
				state.data.Skins[skin.id] = true
				syncTable(player, state, "Skins")
				Notify:FireClient(player, "newSkin", { id = skin.id, name = skin.name, mult = skin.mult })
			end
		end
	end
end

local function onDied(player)
	local state = states[player]
	if not state or not state.run then
		return
	end
	local lost = state.data.Unbanked
	local kept = 0
	if Passes.Owns(player, "DeathInsurance") then
		kept = math.floor(lost * Config.DeathInsuranceKeep)
		set(player, state, "Trophies", state.data.Trophies + kept)
	end
	local stage = state.run.map and state.run.map.stage or 0
	set(player, state, "Unbanked", 0)
	clearRun(player, state)
	Notify:FireClient(player, "death", { lost = lost - kept, kept = kept, stage = stage })
end

-- 던지기 --------------------------------------------------------------------------

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
		onStageCleared(player, state)
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

	-- 공속보다 빠른 요청은 무시 (오토클릭 방지)
	local now = os.clock()
	local interval = 1 / Config.ThrowsPerSecond(state.data.Speed)
	if now - state.lastThrow < interval * 0.85 then
		return
	end
	state.lastThrow = now

	local gain = Config.GainPerThrow(speedContext(player, state))
	addSpeed(player, state, gain)

	local from = root.Position + Vector3.new(0, 1.5, 0)
	local target = findTarget(state.run, root.Position)
	if target then
		local damage = Config.Damage(state.data.Speed)
		ThrowFx:FireAllClients(player, from, target.part.Position, damage, gain, state.data.Skin)
		damageEnemy(player, state, target, damage)
	else
		local landing = from + root.CFrame.LookVector * 30 - Vector3.new(0, 3, 0)
		ThrowFx:FireAllClients(player, from, landing, nil, gain, state.data.Skin)
	end
end)

-- 상점·환생·텔레포트·코드·선물 ---------------------------------------------------------------

local function ownsSkin(player, state, skin)
	return skin.id == "basic" or state.data.Skins[skin.id] == true or Passes.Owns(player, skin.pass)
end

local function equipBest(player, state)
	local bestSkin, bestAura = Config.Skins[1], nil
	for _, skin in ipairs(Config.Skins) do
		if ownsSkin(player, state, skin) and skin.mult > bestSkin.mult then
			bestSkin = skin
		end
	end
	for _, aura in ipairs(Config.Auras) do
		if state.data.Auras[aura.id] and (not bestAura or aura.mult > bestAura.mult) then
			bestAura = aura
		end
	end
	set(player, state, "Skin", bestSkin.id)
	set(player, state, "Aura", bestAura and bestAura.id or "")
	applyAura(player, state)
end

local actions = {}

function actions.buySkin(player, state, id)
	local skin = Config.FindById(Config.Skins, id)
	if not skin or ownsSkin(player, state, skin) then
		return
	end
	if skin.pass then
		local ok, reason = Passes.Prompt(player, skin.pass)
		if not ok then
			toast(player, reason, RED)
		end
		return
	end
	if skin.boss then
		toast(player, "월드 " .. skin.boss .. " 보스를 쓰러뜨리면 얻을 수 있어요", RED)
		return
	end
	if state.data.Trophies < skin.cost then
		toast(player, "🏆 트로피가 부족해요", RED)
		return
	end
	set(player, state, "Trophies", state.data.Trophies - skin.cost)
	state.data.Skins[skin.id] = true
	syncTable(player, state, "Skins")
	set(player, state, "Skin", skin.id)
	Notify:FireClient(player, "newSkin", { id = skin.id, name = skin.name, mult = skin.mult })
end

function actions.equipSkin(player, state, id)
	local skin = Config.FindById(Config.Skins, id)
	if skin and ownsSkin(player, state, skin) then
		set(player, state, "Skin", skin.id)
	end
end

function actions.buyAura(player, state, id)
	local aura = Config.FindById(Config.Auras, id)
	if not aura or state.data.Auras[aura.id] then
		return
	end
	if state.data.Trophies < aura.cost then
		toast(player, "🏆 트로피가 부족해요", RED)
		return
	end
	set(player, state, "Trophies", state.data.Trophies - aura.cost)
	state.data.Auras[aura.id] = true
	syncTable(player, state, "Auras")
	set(player, state, "Aura", aura.id)
	applyAura(player, state)
	toast(player, "✨ " .. aura.name .. " 획득! 속도 x" .. aura.mult, GOLD)
end

function actions.equipAura(player, state, id)
	if id == "" or (Config.FindById(Config.Auras, id) and state.data.Auras[id]) then
		set(player, state, "Aura", id)
		applyAura(player, state)
	end
end

function actions.equipBest(player, state)
	equipBest(player, state)
	toast(player, "✅ 가장 좋은 걸로 장착했어요", CYAN)
end

function actions.buyPass(player, _state, key)
	local ok, reason = Passes.Prompt(player, key)
	if not ok then
		toast(player, reason, RED)
	end
end

function actions.rebirth(player, state)
	if state.run then
		toast(player, "환생은 로비에서만 할 수 있어요", RED)
		return
	end
	local need = Config.RebirthLevel(state.data.Rebirths)
	if state.data.Level < need then
		toast(player, "레벨 " .. need .. "이 필요해요", RED)
		return
	end
	set(player, state, "Rebirths", state.data.Rebirths + 1)
	set(player, state, "Speed", 0)
	set(player, state, "Level", 1)
	applyLevelStats(player, state)
	Notify:FireClient(player, "rebirth", {
		rebirths = state.data.Rebirths,
		multiplier = Config.RebirthMultiplier(state.data.Rebirths),
	})
end

function actions.teleport(player, state, world, stage)
	if type(world) ~= "number" or type(stage) ~= "number" or not Config.Worlds[world] then
		return
	end
	stage = math.floor(stage)
	if state.run then
		toast(player, "텔레포트는 로비에서만 할 수 있어요", RED)
		return
	end
	if state.data.Level < Config.Worlds[world].level then
		toast(player, "🔒 레벨 " .. Config.Worlds[world].level .. "이 필요해요", RED)
		return
	end
	local maxStage = math.min(Config.StagesPerWorld, state.data.BestStages[world] + 1)
	if stage < 1 or stage > maxStage then
		toast(player, "아직 도착하지 못한 스테이지예요", RED)
		return
	end
	local cost = Config.TeleportCost(world, stage)
	if state.data.Trophies < cost then
		toast(player, "🏆 트로피가 부족해요", RED)
		return
	end
	set(player, state, "Trophies", state.data.Trophies - cost)
	startRun(player, state, world, stage)
end

function actions.code(player, state, text)
	if type(text) ~= "string" then
		return
	end
	local code = text:upper():gsub("%s", "")
	local reward = Config.Codes[code]
	if not reward then
		toast(player, "❌ 없는 코드예요", RED)
		return
	end
	if state.data.Codes[code] then
		toast(player, "이미 사용한 코드예요", RED)
		return
	end
	state.data.Codes[code] = true
	if reward.speed then
		addSpeed(player, state, reward.speed)
	end
	if reward.trophies then
		set(player, state, "Trophies", state.data.Trophies + reward.trophies)
	end
	toast(player, "🎟️ 코드 사용! " .. (reward.text or ""), GOLD)
end

function actions.gift(player, state)
	local now = os.time()
	local left = state.data.LastGift + Config.GiftCooldown - now
	if left > 0 then
		if ready(state, "giftWait", 3) then
			toast(player, "🎁 다음 선물까지 " .. math.ceil(left / 60) .. "분", RED)
		end
		return
	end
	local amount = Config.GainPerThrow(speedContext(player, state)) * Config.GiftThrows
	set(player, state, "LastGift", now)
	addSpeed(player, state, amount)
	Notify:FireClient(player, "gift", { speed = amount })
end

ActionRemote.OnServerEvent:Connect(function(player, action, a, b)
	local state = states[player]
	local handler = type(action) == "string" and actions[action]
	if state and handler then
		handler(player, state, a, b)
	end
end)

Passes.OnChanged(function(player, key)
	syncPasses(player)
	local state = states[player]
	if not state then
		return
	end
	local info = Config.GamePasses[key]
	toast(player, "🎉 " .. info.name .. " 구매 완료!", GOLD)
	-- 스킨 게임패스는 사자마자 장착
	for _, skin in ipairs(Config.Skins) do
		if skin.pass == key then
			set(player, state, "Skin", skin.id)
		end
	end
end)

-- 로비: 발판, 포털, 선물 상자 ---------------------------------------------------------------

local function playerFromHit(hit)
	local player = Players:GetPlayerFromCharacter(hit.Parent)
	return player, player and states[player]
end

for index, padPart in ipairs(lobby.pads) do
	padPart.Touched:Connect(function(hit)
		local player, state = playerFromHit(hit)
		if not state or index <= state.data.Pad or not ready(state, "pad" .. index, 1.5) then
			return
		end
		local pad = Config.Pads[index]
		if state.data.Trophies < pad.cost then
			toast(player, "🏆 " .. Format.Short(pad.cost) .. " 필요해요", RED)
			return
		end
		set(player, state, "Trophies", state.data.Trophies - pad.cost)
		set(player, state, "Pad", index)
		toast(player, "⚡ 던지기 파워 +" .. Format.Short(pad.value) .. "!", CYAN)
	end)
end

for world, portalPad in ipairs(lobby.portals) do
	portalPad.Touched:Connect(function(hit)
		local player, state = playerFromHit(hit)
		if not state or state.run then
			return
		end
		local need = Config.Worlds[world].level
		if state.data.Level < need then
			if ready(state, "portal" .. world, 2) then
				toast(player, "🔒 월드 " .. world .. "는 레벨 " .. need .. "부터 갈 수 있어요", RED)
			end
			return
		end
		startRun(player, state, world, 1)
	end)
end

lobby.chest.Touched:Connect(function(hit)
	local player, state = playerFromHit(hit)
	if state and ready(state, "chest", 2) then
		actions.gift(player, state)
	end
end)

-- 훈련 허수아비 -----------------------------------------------------------------------------

task.spawn(function()
	while true do
		task.wait(1 / Config.DummyThrowsPerSecond)
		for player, state in pairs(states) do
			local root = not state.run and getCharacterParts(player)
			if root then
				for _, dummy in ipairs(lobby.dummies) do
					local offset = root.Position - dummy.position
					if Vector3.new(offset.X, 0, offset.Z).Magnitude <= Config.DummyRange then
						local info = Config.Dummies[dummy.tier]
						if info.pass and not Passes.Owns(player, info.pass) then
							if ready(state, "dummyLocked", 6) then
								toast(player, "🔒 " .. info.name .. "는 게임패스가 필요해요", RED)
								Passes.Prompt(player, info.pass)
							end
						else
							local gain = Config.GainPerThrow(speedContext(player, state)) * info.mult
							addSpeed(player, state, gain)
							ThrowFx:FireAllClients(player, root.Position + Vector3.new(0, 1.5, 0), dummy.body.Position, nil, gain, state.data.Skin)
						end
						break
					end
				end
			end
		end
	end
end)

-- 적 움직임과 공격 (매 프레임) ------------------------------------------------------------------

-- 적이 길 밖으로 못 나가게. 길보다 큰 적(보스)은 길 가운데에 둡니다
local function clampInside(value, low, high, margin)
	if high - low <= margin * 2 then
		return (low + high) / 2
	end
	return math.clamp(value, low + margin, high - margin)
end

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
		newPosition = Vector3.new(
			clampInside(newPosition.X, bounds.minX, bounds.maxX, enemy.radius),
			enemy.baseY + math.abs(math.sin(now * 8 + enemy.bobOffset)) * 0.8,
			clampInside(newPosition.Z, bounds.minZ, bounds.maxZ, enemy.radius)
		)
	end
	enemy.part.CFrame = CFrame.lookAt(newPosition, newPosition + direction)

	if distance <= reach + 1 and math.abs(toPlayer.Y) < enemy.radius + 6 and now - enemy.lastAttack >= Config.EnemyAttackCooldown then
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
					humanoid.Health = 0 -- 키보드에서 떨어짐
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

-- 운영자 이벤트: 채팅에 "/event 10 30" (속도 10배 30분), "/event off" -------------------------------

local EVENT_TOPIC = "WakppuEvent"

local function applyEvent(mult, ends)
	workspace:SetAttribute("EventMult", mult)
	workspace:SetAttribute("EventEnds", ends)
	if mult > 1 and ends > os.time() then
		for _, player in ipairs(Players:GetPlayers()) do
			toast(player, "⚡ 운영자 이벤트! 속도 x" .. Format.Short(mult), GOLD)
		end
	end
end

pcall(function()
	MessagingService:SubscribeAsync(EVENT_TOPIC, function(message)
		local payload = message.Data
		if type(payload) == "table" and type(payload.mult) == "number" and type(payload.ends) == "number" then
			applyEvent(payload.mult, payload.ends)
		end
	end)
end)

local function isAdmin(player)
	if RunService:IsStudio() then
		return true
	end
	if game.CreatorType == Enum.CreatorType.User and player.UserId == game.CreatorId then
		return true
	end
	return table.find(Config.Admins, player.UserId) ~= nil
end

local function onChatted(player, message)
	if not isAdmin(player) then
		return
	end
	local words = string.split(message, " ")
	if words[1] ~= "/event" then
		return
	end
	local mult, ends
	if words[2] == "off" then
		mult, ends = 1, 0
	else
		mult = math.clamp(tonumber(words[2]) or 2, 1, 1e6)
		ends = os.time() + math.clamp(tonumber(words[3]) or 30, 1, 24 * 60) * 60
	end
	applyEvent(mult, ends)
	pcall(function()
		MessagingService:PublishAsync(EVENT_TOPIC, { mult = mult, ends = ends })
	end)
end

task.spawn(function()
	while true do
		task.wait(1)
		if workspace:GetAttribute("EventMult") ~= 1 and workspace:GetAttribute("EventEnds") <= os.time() then
			workspace:SetAttribute("EventMult", 1)
			for _, player in ipairs(Players:GetPlayers()) do
				toast(player, "운영자 이벤트가 끝났어요", Color3.new(1, 1, 1))
			end
		end
	end
end)

-- 랭킹 보드 ---------------------------------------------------------------------------------

local nameCache = {}

local function nameFor(userId)
	if nameCache[userId] then
		return nameCache[userId]
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	nameCache[userId] = ok and name or ("#" .. userId)
	return nameCache[userId]
end

local function refreshBoard()
	local rows = {}
	local ok = false
	if Data.TopStore then
		ok = pcall(function()
			local page = Data.TopStore:GetSortedAsync(false, 10):GetCurrentPage()
			for rank, entry in ipairs(page) do
				rows[rank] = rank .. ". " .. nameFor(tonumber(entry.key)) .. "  ⚡" .. Format.Short(entry.value)
			end
		end)
	end
	if ok and #rows > 0 then
		World.SetBoardRows(lobby.board, "🏆 전체 속도 TOP 10", rows)
		return
	end
	-- 저장이 꺼져 있으면 이 서버 사람들로 보여줍니다
	local list = {}
	for player, state in pairs(states) do
		table.insert(list, { name = player.Name, speed = state.data.Speed })
	end
	table.sort(list, function(a, b)
		return a.speed > b.speed
	end)
	rows = {}
	for rank = 1, math.min(10, #list) do
		rows[rank] = rank .. ". " .. list[rank].name .. "  ⚡" .. Format.Short(list[rank].speed)
	end
	World.SetBoardRows(lobby.board, "🏆 이 서버 속도 TOP", rows)
end

task.spawn(function()
	while true do
		refreshBoard()
		task.wait(Data.TopStore and 60 or 10)
	end
end)

-- 플레이어 입장/퇴장 -------------------------------------------------------------------------

local function onCharacterAdded(player, character)
	local humanoid = character:WaitForChild("Humanoid")
	character:WaitForChild("HumanoidRootPart")
	humanoid.Died:Connect(function()
		onDied(player)
	end)
	local state = states[player]
	if state then
		applyLevelStats(player, state)
		humanoid.Health = humanoid.MaxHealth
		applyAura(player, state)
	end
end

local function onPlayerAdded(player)
	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)
	player.Chatted:Connect(function(message)
		onChatted(player, message)
	end)

	local data = Data.Load(player)
	Passes.Load(player)
	if not player.Parent then
		return
	end
	data.Level = Config.LevelFromSpeed(data.Speed)
	data.Unbanked = 0
	data.World = 0
	data.Stage = 0
	data.EnemiesLeft = 0

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	for _, info in ipairs({ { "⚡ 속도", "StringValue" }, { "🏆 트로피", "StringValue" }, { "🔁 환생", "IntValue" } }) do
		local value = Instance.new(info[2])
		value.Name = info[1]
		value.Parent = leaderstats
	end
	leaderstats.Parent = player

	local state = { data = data, lastThrow = 0, run = nil, cooldowns = {} }
	states[player] = state
	updateLeaderstats(player, state)
	for key, value in pairs(data) do
		if type(value) == "table" then
			syncTable(player, state, key)
		else
			player:SetAttribute(key, value)
		end
	end
	syncPasses(player)
	player:SetAttribute("Ready", true)

	if player.Character then
		applyLevelStats(player, state)
		applyAura(player, state)
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
	Passes.Release(player)
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
