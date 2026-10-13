--[[
	맵을 코드로 만듭니다: 로비(스폰, 출발 포털, 훈련 허수아비)와 스테이지(길, 적, 출구).
	스테이지는 플레이어마다 따로 만들어지고, 다음 스테이지로 가면 지워집니다.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Format = require(ReplicatedStorage.Shared:WaitForChild("Format"))

local World = {}

local random = Random.new()

local function part(props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in pairs(props) do
		if key ~= "Parent" then
			p[key] = value
		end
	end
	p.Parent = props.Parent
	return p
end

-- 파트 위에 떠 있는 글자 (크기는 스터드 단위)
local function sign(adornee, text, width, height, offsetY, color)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.new(width, 0, height, 0)
	gui.StudsOffset = Vector3.new(0, offsetY, 0)
	gui.MaxDistance = 300
	gui.LightInfluence = 0

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = color or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.2
	label.Text = text
	label.Parent = gui

	gui.Parent = adornee
	return label
end

-- 로비 ---------------------------------------------------------------------

function World.BuildLobby()
	local folder = Instance.new("Folder")
	folder.Name = "Lobby"
	folder.Parent = workspace

	part({
		Name = "Ground",
		Size = Vector3.new(160, 2, 160),
		Position = Vector3.new(0, -1, 0),
		Color = Color3.fromRGB(110, 190, 95),
		Material = Enum.Material.Grass,
		Parent = folder,
	})

	-- 가장자리 울타리
	for _, info in ipairs({
		{ Vector3.new(0, 1.5, 80), Vector3.new(160, 3, 2) },
		{ Vector3.new(0, 1.5, -80), Vector3.new(160, 3, 2) },
		{ Vector3.new(80, 1.5, 0), Vector3.new(2, 3, 160) },
		{ Vector3.new(-80, 1.5, 0), Vector3.new(2, 3, 160) },
	}) do
		part({
			Name = "Fence",
			Position = info[1],
			Size = info[2],
			Color = Color3.fromRGB(150, 105, 70),
			Material = Enum.Material.Wood,
			Parent = folder,
		})
	end

	local spawnLocation = Instance.new("SpawnLocation")
	spawnLocation.Name = "Spawn"
	spawnLocation.Anchored = true
	spawnLocation.Size = Vector3.new(10, 1, 10)
	spawnLocation.Position = Vector3.new(0, 0.5, 25)
	spawnLocation.Color = Color3.fromRGB(255, 170, 210)
	spawnLocation.Material = Enum.Material.SmoothPlastic
	spawnLocation.Neutral = true
	spawnLocation.Duration = 0
	spawnLocation.TopSurface = Enum.SurfaceType.Smooth
	spawnLocation.Parent = folder

	local titlePost = part({
		Name = "Title",
		Size = Vector3.new(1, 1, 1),
		Position = Vector3.new(0, 18, 0),
		Transparency = 1,
		CanCollide = false,
		Parent = folder,
	})
	sign(titlePost, "🎯 " .. Config.GameName, 40, 8, 0, Color3.fromRGB(255, 220, 120))

	-- 출발 포털
	local portal = part({
		Name = "Portal",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(1, 16, 16),
		CFrame = CFrame.new(0, 0.5, -40) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(170, 90, 255),
		Material = Enum.Material.Neon,
		CanCollide = false,
		Parent = folder,
	})
	for _, x in ipairs({ -9, 9 }) do
		part({
			Name = "PortalPillar",
			Size = Vector3.new(2, 14, 2),
			Position = Vector3.new(x, 7, -40),
			Color = Color3.fromRGB(90, 50, 160),
			Material = Enum.Material.SmoothPlastic,
			Parent = folder,
		})
	end
	local portalTop = part({
		Name = "PortalTop",
		Size = Vector3.new(20, 2, 2),
		Position = Vector3.new(0, 15, -40),
		Color = Color3.fromRGB(90, 50, 160),
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})
	sign(portalTop, "▶ 출발! 스테이지 1부터", 24, 4, 4, Color3.fromRGB(230, 200, 255))

	-- 훈련 허수아비
	local dummyBase = Vector3.new(45, 0, 10)
	part({
		Name = "DummyZone",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.2, Config.DummyRange * 2, Config.DummyRange * 2),
		CFrame = CFrame.new(dummyBase + Vector3.new(0, 0.1, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(255, 240, 150),
		Material = Enum.Material.Neon,
		Transparency = 0.6,
		CanCollide = false,
		Parent = folder,
	})
	part({
		Name = "DummyPost",
		Size = Vector3.new(1, 8, 1),
		Position = dummyBase + Vector3.new(0, 4, 0),
		Color = Color3.fromRGB(130, 90, 55),
		Material = Enum.Material.Wood,
		Parent = folder,
	})
	local dummy = part({
		Name = "Dummy",
		Size = Vector3.new(4, 4, 2),
		Position = dummyBase + Vector3.new(0, 6, 0),
		Color = Color3.fromRGB(225, 190, 120),
		Material = Enum.Material.Fabric,
		Parent = folder,
	})
	part({
		Name = "DummyArms",
		Size = Vector3.new(8, 1, 1),
		Position = dummyBase + Vector3.new(0, 7, 0),
		Color = Color3.fromRGB(130, 90, 55),
		Material = Enum.Material.Wood,
		Parent = folder,
	})
	local head = part({
		Name = "DummyHead",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(3, 3, 3),
		Position = dummyBase + Vector3.new(0, 9.5, 0),
		Color = Color3.fromRGB(225, 190, 120),
		Material = Enum.Material.Fabric,
		Parent = folder,
	})
	sign(head, "훈련 허수아비\n노란 원 안에 서 있으면 자동으로 던져요", 16, 4, 4.5, Color3.fromRGB(255, 240, 170))

	return {
		folder = folder,
		spawn = spawnLocation,
		portal = portal,
		dummy = dummy,
		spawnCFrame = spawnLocation.CFrame + Vector3.new(0, 4, 0),
	}
end

-- 스테이지 -------------------------------------------------------------------

local function pickEnemyType(stage)
	local pool, total = {}, 0
	for _, enemyType in ipairs(Config.EnemyTypes) do
		if stage >= enemyType.minStage then
			table.insert(pool, enemyType)
			total += enemyType.weight
		end
	end
	local roll = random:NextNumber(0, total)
	for _, enemyType in ipairs(pool) do
		roll -= enemyType.weight
		if roll <= 0 then
			return enemyType
		end
	end
	return pool[#pool]
end

-- 스테이지가 깊을수록 길 색이 초록 → 주황 → 빨강으로 바뀝니다
local function pathColor(stage)
	local t = math.clamp((stage - 1) / math.max(1, Config.StagesPerWorld - 1), 0, 1)
	local safe = Color3.fromRGB(140, 200, 110)
	local danger = Color3.fromRGB(200, 90, 80)
	return safe:Lerp(danger, t)
end

local function createEnemy(folder, enemyType, position, stage)
	local size = enemyType.size
	local body = part({
		Name = enemyType.id,
		Shape = enemyType.shape == "Ball" and Enum.PartType.Ball or Enum.PartType.Block,
		Size = Vector3.new(size, size, size),
		CFrame = CFrame.new(position),
		Color = enemyType.color,
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})

	local face = Instance.new("Decal")
	face.Texture = "rbxasset://textures/face.png"
	face.Face = Enum.NormalId.Front
	face.Parent = body

	local maxHealth = math.max(1, math.floor(Config.EnemyHealth(stage) * enemyType.health))

	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(110, 34)
	gui.StudsOffset = Vector3.new(0, size / 2 + 1.5, 0)
	gui.MaxDistance = 120
	gui.Parent = body

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Size = UDim2.new(1, 0, 0.5, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Font = Enum.Font.FredokaOne
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = Color3.new(1, 1, 1)
	nameLabel.TextStrokeTransparency = 0.3
	nameLabel.Text = enemyType.name
	nameLabel.Parent = gui

	local barBack = Instance.new("Frame")
	barBack.Position = UDim2.new(0, 0, 0.55, 0)
	barBack.Size = UDim2.new(1, 0, 0.4, 0)
	barBack.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
	barBack.BorderSizePixel = 0
	barBack.Parent = gui

	local bar = Instance.new("Frame")
	bar.Size = UDim2.fromScale(1, 1)
	bar.BackgroundColor3 = Color3.fromRGB(240, 80, 80)
	bar.BorderSizePixel = 0
	bar.Parent = barBack

	local hpLabel = Instance.new("TextLabel")
	hpLabel.Size = UDim2.fromScale(1, 1)
	hpLabel.BackgroundTransparency = 1
	hpLabel.Font = Enum.Font.FredokaOne
	hpLabel.TextScaled = true
	hpLabel.TextColor3 = Color3.new(1, 1, 1)
	hpLabel.Text = Format.Short(maxHealth)
	hpLabel.ZIndex = 2
	hpLabel.Parent = barBack

	return {
		part = body,
		type = enemyType,
		health = maxHealth,
		maxHealth = maxHealth,
		damage = math.floor(Config.EnemyDamage(stage) * enemyType.damage),
		speed = enemyType.speed,
		radius = size / 2,
		baseY = position.Y,
		bobOffset = random:NextNumber(0, math.pi * 2),
		lastAttack = 0,
		dead = false,
		bar = bar,
		hpLabel = hpLabel,
	}
end

function World.UpdateEnemyBar(enemy)
	local ratio = math.clamp(enemy.health / enemy.maxHealth, 0, 1)
	enemy.bar.Size = UDim2.fromScale(ratio, 1)
	enemy.hpLabel.Text = Format.Short(math.max(0, enemy.health))
end

function World.KillEnemy(enemy)
	local body = enemy.part
	body.CanCollide = false
	local gui = body:FindFirstChildOfClass("BillboardGui")
	if gui then
		gui:Destroy()
	end
	TweenService:Create(body, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.In), {
		Size = Vector3.new(0.2, 0.2, 0.2),
		Transparency = 1,
	}):Play()
	Debris:AddItem(body, 0.3)
end

--[[
	origin: 스테이지 시작점 (길 윗면 높이)
	스테이지는 origin에서 -Z 방향으로 뻗어 있습니다.
	[출발 발판] → [길 + 적] → [잠긴 문] → [출구 발판]
]]
function World.BuildStage(origin, stage, ownerName)
	local folder = Instance.new("Folder")
	folder.Name = ownerName .. "_Stage" .. stage
	folder.Parent = workspace

	local length = Config.PathLength(stage)
	local width = Config.PathWidth(stage)
	local endZ = -10 - length

	local function at(x, y, z)
		return origin + Vector3.new(x, y, z)
	end

	local startPad = part({
		Name = "Start",
		Size = Vector3.new(26, 2, 20),
		Position = at(0, -1, 0),
		Color = Color3.fromRGB(235, 235, 245),
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})
	sign(startPad, "스테이지 " .. stage .. " / " .. Config.StagesPerWorld, 18, 4, 8, Color3.fromRGB(255, 255, 255))

	part({
		Name = "Path",
		Size = Vector3.new(width, 2, length),
		Position = at(0, -1, -10 - length / 2),
		Color = pathColor(stage),
		Material = Enum.Material.Grass,
		Parent = folder,
	})

	part({
		Name = "End",
		Size = Vector3.new(26, 2, 30),
		Position = at(0, -1, endZ - 15),
		Color = Color3.fromRGB(235, 235, 245),
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})

	local gate = part({
		Name = "Gate",
		Size = Vector3.new(26, 20, 2),
		Position = at(0, 10, endZ - 3),
		Color = Color3.fromRGB(230, 70, 70),
		Material = Enum.Material.Neon,
		Transparency = 0.35,
		Parent = folder,
	})
	local gateLabel = sign(gate, "", 20, 4, 13, Color3.fromRGB(255, 220, 220))

	local exitPad = part({
		Name = "Exit",
		Size = Vector3.new(12, 1, 12),
		Position = at(0, 0.5, endZ - 18),
		Color = Color3.fromRGB(90, 230, 120),
		Material = Enum.Material.Neon,
		CanCollide = false,
		Parent = folder,
	})

	-- 적 배치: 길을 따라 고르게 흩어 놓습니다
	local enemyFolder = Instance.new("Folder")
	enemyFolder.Name = "Enemies"
	enemyFolder.Parent = folder

	local enemies = {}
	local count = Config.EnemyCount(stage)
	local firstZ, lastZ = -40, endZ + 15
	for i = 1, count do
		local enemyType = pickEnemyType(stage)
		local t = count == 1 and 0.5 or (i - 1) / (count - 1)
		local z = firstZ + (lastZ - firstZ) * t + random:NextNumber(-6, 6)
		local halfRoom = math.max(0, width / 2 - enemyType.size / 2 - 1)
		local x = random:NextNumber(-halfRoom, halfRoom)
		local position = at(x, enemyType.size / 2, z)
		table.insert(enemies, createEnemy(enemyFolder, enemyType, position, stage))
	end

	local map = {
		folder = folder,
		stage = stage,
		enemies = enemies,
		gate = gate,
		gateLabel = gateLabel,
		exitPad = exitPad,
		startCFrame = CFrame.lookAt(at(0, 4, 0), at(0, 4, -10)),
		bounds = {
			minX = origin.X - width / 2,
			maxX = origin.X + width / 2,
			minZ = origin.Z + endZ + 2,
			maxZ = origin.Z - 12,
		},
	}
	World.UpdateGate(map, #enemies)
	return map
end

function World.UpdateGate(map, enemiesLeft)
	if enemiesLeft > 0 then
		map.gateLabel.Text = "🔒 남은 적 " .. enemiesLeft .. "마리"
		return
	end
	map.gateLabel.Text = "🚪 출구 열림!"
	map.gate.CanCollide = false
	map.gate.Color = Color3.fromRGB(90, 230, 120)
	TweenService:Create(map.gate, TweenInfo.new(0.6), { Transparency = 0.85 }):Play()
end

return World
