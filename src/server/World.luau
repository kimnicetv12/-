--[[
	맵을 코드로 만듭니다.
	로비: 스폰, 던지기 파워 발판, 훈련 허수아비 5종, 월드 포털 3개, 무료 선물 상자, 랭킹 보드
	스테이지: 키보드 키로 된 길 → 잠긴 문 → 안전지대(노란 귀환 발판 / 초록 다음 포털)
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Format = require(ReplicatedStorage.Shared:WaitForChild("Format"))

local World = {}

local random = Random.new()

local KEY_LETTERS = { "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Z", "X", "C", "V", "B", "N", "M" }

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
function World.Sign(adornee, text, width, height, offsetY, color)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Sign"
	gui.Size = UDim2.new(width, 0, height, 0)
	gui.StudsOffset = Vector3.new(0, offsetY, 0)
	gui.MaxDistance = 250
	gui.LightInfluence = 0

	local label = Instance.new("TextLabel")
	label.Name = "Label"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = color or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0
	label.Text = text
	label.Parent = gui

	gui.Parent = adornee
	return label
end

local sign = World.Sign

local function disc(props)
	-- 원기둥을 눕혀서 납작한 원판으로 씁니다
	local radius = props.Radius
	props.Radius = nil
	props.Shape = Enum.PartType.Cylinder
	props.Size = Vector3.new(props.Thickness or 0.4, radius * 2, radius * 2)
	props.Thickness = nil
	props.CFrame = CFrame.new(props.Position) * CFrame.Angles(0, 0, math.rad(90))
	props.Position = nil
	return part(props)
end

-- 로비 -------------------------------------------------------------------------

local function buildPortal(folder, position, world)
	local info = Config.Worlds[world]
	local model = Instance.new("Model")
	model.Name = "World" .. world
	model.Parent = folder
	local frameColor = info.bossColor
	for _, x in ipairs({ -9, 9 }) do
		part({ Name = "Pillar", Size = Vector3.new(3, 18, 3), Position = position + Vector3.new(x, 9, 0), Color = frameColor, Material = Enum.Material.SmoothPlastic, Parent = model })
	end
	local top = part({ Name = "Top", Size = Vector3.new(21, 3, 3), Position = position + Vector3.new(0, 19.5, 0), Color = frameColor, Material = Enum.Material.SmoothPlastic, Parent = model })
	part({
		Name = "Glow",
		Size = Vector3.new(15, 16, 0.5),
		Position = position + Vector3.new(0, 9, 0),
		Color = info.dangerColor,
		Material = Enum.Material.Neon,
		Transparency = 0.35,
		CanCollide = false,
		Parent = model,
	})
	local pad = disc({ Name = "Pad", Radius = 8, Position = position + Vector3.new(0, 0.2, 6), Color = info.dangerColor, Material = Enum.Material.Neon, CanCollide = false, Parent = model })
	pad:SetAttribute("World", world)
	local levelText = info.level > 1 and ("🔒 Lv " .. info.level .. " 필요") or "▶ 출발!"
	local label = sign(top, "월드 " .. world .. " · " .. info.name .. "\n" .. levelText, 22, 6, 5, Color3.new(1, 1, 1))
	label.Name = "PortalLabel"
	return pad
end

local function buildDummy(folder, base, tier)
	local info = Config.Dummies[tier]
	local model = Instance.new("Model")
	model.Name = "Dummy" .. tier
	model:SetAttribute("Tier", tier)
	model.Parent = folder
	disc({ Name = "Zone", Radius = Config.DummyRange, Thickness = 0.3, Position = base + Vector3.new(0, 0.1, 0), Color = Color3.fromRGB(255, 235, 120), Material = Enum.Material.Neon, Transparency = 0.55, CanCollide = false, Parent = model })
	part({ Name = "Post", Size = Vector3.new(1, 8, 1), Position = base + Vector3.new(0, 4, 0), Color = Color3.fromRGB(120, 85, 55), Material = Enum.Material.Wood, Parent = model })
	local body = part({ Name = "Body", Size = Vector3.new(4, 4, 2), Position = base + Vector3.new(0, 6, 0), Color = info.color, Material = Enum.Material.SmoothPlastic, Parent = model })
	part({ Name = "Arms", Size = Vector3.new(8, 1, 1), Position = base + Vector3.new(0, 7, 0), Color = Color3.fromRGB(120, 85, 55), Material = Enum.Material.Wood, Parent = model })
	local head = part({ Name = "Head", Shape = Enum.PartType.Ball, Size = Vector3.new(3, 3, 3), Position = base + Vector3.new(0, 9.5, 0), Color = info.color, Material = Enum.Material.SmoothPlastic, Parent = model })
	local face = Instance.new("Decal")
	face.Texture = "rbxasset://textures/face.png"
	face.Face = Enum.NormalId.Front
	face.Parent = head
	sign(head, info.name .. "\n훈련 x" .. info.mult, 12, 3.5, 4, Color3.new(1, 1, 1))
	return { model = model, body = body, tier = tier, position = base }
end

function World.BuildLobby()
	local folder = Instance.new("Folder")
	folder.Name = "Lobby"
	folder.Parent = workspace

	part({ Name = "Ground", Size = Vector3.new(220, 2, 220), Position = Vector3.new(0, -1, 0), Color = Color3.fromRGB(110, 200, 100), Material = Enum.Material.Grass, Parent = folder })
	for _, info in ipairs({
		{ Vector3.new(0, 2, 110), Vector3.new(220, 4, 2) },
		{ Vector3.new(0, 2, -110), Vector3.new(220, 4, 2) },
		{ Vector3.new(110, 2, 0), Vector3.new(2, 4, 220) },
		{ Vector3.new(-110, 2, 0), Vector3.new(2, 4, 220) },
	}) do
		part({ Name = "Fence", Position = info[1], Size = info[2], Color = Color3.fromRGB(150, 105, 70), Material = Enum.Material.Wood, Parent = folder })
	end

	local spawnLocation = Instance.new("SpawnLocation")
	spawnLocation.Name = "Spawn"
	spawnLocation.Anchored = true
	spawnLocation.Size = Vector3.new(12, 1, 12)
	spawnLocation.Position = Vector3.new(0, 0.5, 0)
	spawnLocation.Color = Color3.fromRGB(255, 170, 210)
	spawnLocation.Material = Enum.Material.SmoothPlastic
	spawnLocation.Neutral = true
	spawnLocation.Duration = 0
	spawnLocation.TopSurface = Enum.SurfaceType.Smooth
	spawnLocation.Parent = folder

	local title = part({ Name = "Title", Size = Vector3.new(1, 1, 1), Position = Vector3.new(0, 24, -20), Transparency = 1, CanCollide = false, Parent = folder })
	sign(title, "🎯 " .. Config.GameName, 50, 10, 0, Color3.fromRGB(255, 220, 120))

	-- 던지기 파워 발판 (스폰 앞쪽)
	local padFolder = Instance.new("Folder")
	padFolder.Name = "Pads"
	padFolder.Parent = folder
	local pads = {}
	local padCount = #Config.Pads
	for index, pad in ipairs(Config.Pads) do
		local x = (index - (padCount + 1) / 2) * 11
		local padPart = part({
			Name = "Pad" .. index,
			Size = Vector3.new(9, 1, 9),
			Position = Vector3.new(x, 0.5, -30),
			Color = Color3.fromRGB(255, 200, 60),
			Material = Enum.Material.Neon,
			Parent = padFolder,
		})
		padPart:SetAttribute("PadIndex", index)
		sign(padPart, "+" .. Format.Short(pad.value) .. "\n🏆 " .. Format.Short(pad.cost), 7, 4, 4, Color3.new(1, 1, 1))
		pads[index] = padPart
	end
	local padTitle = part({ Name = "PadTitle", Size = Vector3.new(1, 1, 1), Position = Vector3.new(0, 11, -30), Transparency = 1, CanCollide = false, Parent = folder })
	sign(padTitle, "⚡ 던지기 파워 · 밟아서 구매", 34, 4, 0, Color3.fromRGB(255, 240, 160))

	-- 훈련 허수아비 (스폰 뒤쪽, 원작의 트레드밀 자리)
	local dummyFolder = Instance.new("Folder")
	dummyFolder.Name = "Dummies"
	dummyFolder.Parent = folder
	local dummies = {}
	for tier = 1, #Config.Dummies do
		local x = (tier - (#Config.Dummies + 1) / 2) * 20
		dummies[tier] = buildDummy(dummyFolder, Vector3.new(x, 0, 32), tier)
	end
	local dummyTitle = part({ Name = "DummyTitle", Size = Vector3.new(1, 1, 1), Position = Vector3.new(0, 18, 32), Transparency = 1, CanCollide = false, Parent = folder })
	sign(dummyTitle, "🥊 훈련장 · 노란 원 안에 서 있으면 자동 훈련", 44, 4, 0, Color3.fromRGB(255, 240, 160))

	-- 월드 포털 (맨 뒤)
	local portalFolder = Instance.new("Folder")
	portalFolder.Name = "Portals"
	portalFolder.Parent = folder
	local portals = {}
	for world = 1, #Config.Worlds do
		local x = (world - (#Config.Worlds + 1) / 2) * 40
		portals[world] = buildPortal(portalFolder, Vector3.new(x, 0, -80), world)
	end

	-- 무료 선물 상자
	local chest = part({ Name = "GiftChest", Size = Vector3.new(8, 6, 6), Position = Vector3.new(-70, 3, 0), Color = Color3.fromRGB(230, 70, 90), Material = Enum.Material.SmoothPlastic, Parent = folder })
	part({ Name = "Ribbon", Size = Vector3.new(1.5, 6.2, 6.2), Position = Vector3.new(-70, 3, 0), Color = Color3.fromRGB(255, 220, 80), Material = Enum.Material.Neon, CanCollide = false, Parent = folder })
	sign(chest, "🎁 무료 선물\n밟으면 받기", 14, 5, 6, Color3.fromRGB(255, 240, 160))

	-- 랭킹 보드
	local board = part({ Name = "Leaderboard", Size = Vector3.new(1, 26, 20), Position = Vector3.new(80, 13, 0), Color = Color3.fromRGB(40, 35, 60), Material = Enum.Material.SmoothPlastic, Parent = folder })

	return {
		folder = folder,
		spawnCFrame = spawnLocation.CFrame + Vector3.new(0, 4, 0),
		pads = pads,
		dummies = dummies,
		portals = portals,
		chest = chest,
		board = board,
	}
end

-- 스테이지 ------------------------------------------------------------------------

local function pickEnemyType(stage)
	local pool, total = {}, 0
	for index, enemyType in ipairs(Config.EnemyTypes) do
		if stage >= enemyType.minStage then
			table.insert(pool, index)
			total += enemyType.weight
		end
	end
	local roll = random:NextNumber(0, total)
	for _, index in ipairs(pool) do
		roll -= Config.EnemyTypes[index].weight
		if roll <= 0 then
			return index
		end
	end
	return pool[#pool]
end

local function createEnemy(folder, spec)
	local size = spec.size
	local body = part({
		Name = spec.name,
		Shape = spec.shape == "Ball" and Enum.PartType.Ball or Enum.PartType.Block,
		Size = Vector3.new(size, size, size),
		CFrame = CFrame.new(spec.position),
		Color = spec.color,
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})

	local face = Instance.new("Decal")
	face.Texture = "rbxasset://textures/face.png"
	face.Face = Enum.NormalId.Front
	face.Parent = body

	local gui = Instance.new("BillboardGui")
	gui.Size = spec.boss and UDim2.fromOffset(220, 56) or UDim2.fromOffset(110, 34)
	gui.StudsOffset = Vector3.new(0, size / 2 + 1.5, 0)
	gui.MaxDistance = spec.boss and 250 or 120
	gui.Parent = body

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Size = UDim2.new(1, 0, 0.5, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Font = Enum.Font.FredokaOne
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = spec.boss and Color3.fromRGB(255, 220, 90) or Color3.new(1, 1, 1)
	nameLabel.TextStrokeTransparency = 0.2
	nameLabel.Text = spec.boss and ("👑 " .. spec.name) or spec.name
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
	hpLabel.Text = Format.Short(spec.health)
	hpLabel.ZIndex = 2
	hpLabel.Parent = barBack

	return {
		part = body,
		health = spec.health,
		maxHealth = spec.health,
		damage = spec.damage,
		speed = spec.speed,
		radius = size / 2,
		baseY = spec.position.Y,
		bobOffset = random:NextNumber(0, math.pi * 2),
		lastAttack = 0,
		dead = false,
		boss = spec.boss,
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

-- 키보드 키처럼 생긴 길. 일부 줄은 비워서 점프 구간을 만듭니다
local function buildKeyPath(folder, origin, stage, worldInfo, length, width)
	local rowDepth = 4
	local rows = math.floor(length / rowDepth)
	local columns = math.max(2, math.floor(width / 6 + 0.5))
	local keyWidth = width / columns

	local gapRows = {}
	local gapCount = Config.GapCount(stage)
	for g = 1, gapCount do
		-- 시작 부분과 끝 부분을 피해서 고르게 배치
		local row = math.floor(rows * g / (gapCount + 1))
		if row > 4 and row < rows - 3 then
			gapRows[row] = true
		end
	end

	local t = (stage - 1) / math.max(1, Config.StagesPerWorld - 1)
	for row = 0, rows - 1 do
		if not gapRows[row] then
			for column = 0, columns - 1 do
				local x = -width / 2 + keyWidth * (column + 0.5)
				local z = -10 - rowDepth * (row + 0.5)
				local base = worldInfo.keyColors[(row + column) % 2 + 1]
				local key = part({
					Name = "Key",
					Size = Vector3.new(keyWidth - 0.35, 1.6, rowDepth - 0.35),
					Position = origin + Vector3.new(x, -0.8, z),
					Color = base:Lerp(worldInfo.dangerColor, t * 0.6),
					Material = Enum.Material.SmoothPlastic,
					Parent = folder,
				})
				if (row * columns + column) % 7 == 0 then
					local surface = Instance.new("SurfaceGui")
					surface.Face = Enum.NormalId.Top
					surface.CanvasSize = Vector2.new(100, 100)
					surface.LightInfluence = 0
					local letter = Instance.new("TextLabel")
					letter.Size = UDim2.fromScale(1, 1)
					letter.BackgroundTransparency = 1
					letter.Font = Enum.Font.FredokaOne
					letter.TextScaled = true
					letter.TextColor3 = Color3.fromRGB(80, 80, 100)
					letter.TextTransparency = 0.3
					letter.Text = KEY_LETTERS[random:NextInteger(1, #KEY_LETTERS)]
					letter.Parent = surface
					surface.Parent = key
				end
			end
		end
	end
	return rows * rowDepth
end

--[[
	origin: 스테이지 시작점 (길 윗면 높이). 스테이지는 origin에서 -Z 방향으로 뻗어 있습니다.
	[출발 발판] → [키보드 길 + 적] → [잠긴 문] → [안전지대: 노란 귀환 발판 / 초록 다음 포털]
]]
function World.BuildStage(origin, world, stage, ownerName)
	local worldInfo = Config.Worlds[world]
	local folder = Instance.new("Folder")
	folder.Name = ownerName .. "_W" .. world .. "S" .. stage
	folder.Parent = workspace

	local width = Config.PathWidth(stage)
	local length = buildKeyPath(folder, origin, stage, worldInfo, Config.PathLength(stage), width)
	local endZ = -10 - length

	local function at(x, y, z)
		return origin + Vector3.new(x, y, z)
	end

	local startPad = part({ Name = "Start", Size = Vector3.new(26, 2, 20), Position = at(0, -1, 0), Color = Color3.fromRGB(235, 235, 245), Material = Enum.Material.SmoothPlastic, Parent = folder })
	sign(startPad, "월드 " .. world .. " · 스테이지 " .. stage .. " / " .. Config.StagesPerWorld, 22, 4, 8, Color3.new(1, 1, 1))

	-- 안전지대
	part({ Name = "SafeZone", Size = Vector3.new(44, 2, 36), Position = at(0, -1, endZ - 18), Color = Color3.fromRGB(235, 235, 245), Material = Enum.Material.SmoothPlastic, Parent = folder })

	local gate = part({ Name = "Gate", Size = Vector3.new(44, 22, 2), Position = at(0, 11, endZ - 2), Color = Color3.fromRGB(230, 70, 70), Material = Enum.Material.Neon, Transparency = 0.35, Parent = folder })
	local gateLabel = sign(gate, "", 22, 4, 14, Color3.fromRGB(255, 225, 225))

	local isLast = stage >= Config.StagesPerWorld
	local bankPad = part({
		Name = "BankPad",
		Size = Vector3.new(12, 1, 12),
		Position = at(isLast and 0 or -11, 0.5, endZ - 20),
		Color = Color3.fromRGB(255, 215, 50),
		Material = Enum.Material.Neon,
		CanCollide = false,
		Parent = folder,
	})
	sign(bankPad, isLast and "👑 월드 클리어!\n🟡 귀환 · 트로피 받기" or "🟡 귀환\n트로피 받기", 12, 5, 5, Color3.fromRGB(255, 245, 180))

	local nextPortal
	if not isLast then
		nextPortal = part({
			Name = "NextPortal",
			Size = Vector3.new(12, 1, 12),
			Position = at(11, 0.5, endZ - 20),
			Color = Color3.fromRGB(80, 230, 120),
			Material = Enum.Material.Neon,
			CanCollide = false,
			Parent = folder,
		})
		part({ Name = "NextArch", Size = Vector3.new(12, 14, 1), Position = at(11, 7, endZ - 27), Color = Color3.fromRGB(80, 230, 120), Material = Enum.Material.Neon, Transparency = 0.4, CanCollide = false, Parent = folder })
		sign(
			nextPortal,
			"🟢 전진 ▶ 스테이지 " .. (stage + 1) .. "\n권장 Lv " .. Format.Short(Config.RecommendedLevel(world, stage + 1)),
			12,
			5,
			5,
			Color3.fromRGB(200, 255, 210)
		)
	end

	-- 적 배치
	local enemyFolder = Instance.new("Folder")
	enemyFolder.Name = "Enemies"
	enemyFolder.Parent = folder

	local enemies = {}
	local count = Config.EnemyCount(world, stage)
	local health = Config.EnemyHealth(world, stage)
	local damage = Config.EnemyDamage(world, stage)
	local firstZ, lastZ = -40, endZ + 25
	for i = 1, count do
		local typeIndex = pickEnemyType(stage)
		local enemyType = Config.EnemyTypes[typeIndex]
		local t = count == 1 and 0.5 or (i - 1) / (count - 1)
		local z = firstZ + (lastZ - firstZ) * t + random:NextNumber(-5, 5)
		local halfRoom = math.max(0, width / 2 - enemyType.size / 2 - 1)
		table.insert(enemies, createEnemy(enemyFolder, {
			name = worldInfo.enemyNames[typeIndex] or enemyType.id,
			shape = enemyType.shape,
			size = enemyType.size,
			color = enemyType.color:Lerp(worldInfo.bossColor, 0.3),
			position = at(random:NextNumber(-halfRoom, halfRoom), enemyType.size / 2, z),
			health = math.max(1, math.floor(health * enemyType.health)),
			damage = math.ceil(damage * enemyType.damage),
			speed = enemyType.speed,
		}))
	end

	if isLast then
		local boss = Config.Boss
		table.insert(enemies, createEnemy(enemyFolder, {
			name = worldInfo.bossName,
			shape = "Ball",
			size = boss.size,
			color = worldInfo.bossColor,
			position = at(0, boss.size / 2, endZ + 14),
			health = health * boss.health,
			damage = damage * boss.damage,
			speed = boss.speed,
			boss = true,
		}))
	end

	local map = {
		folder = folder,
		world = world,
		stage = stage,
		enemies = enemies,
		gate = gate,
		gateLabel = gateLabel,
		bankPad = bankPad,
		nextPortal = nextPortal,
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
		map.gateLabel.Text = "🔒 남은 적 " .. enemiesLeft
		return
	end
	map.gateLabel.Text = "🚪 출구 열림!"
	map.gate.CanCollide = false
	map.gate.Color = Color3.fromRGB(90, 230, 120)
	TweenService:Create(map.gate, TweenInfo.new(0.6), { Transparency = 0.85 }):Play()
end

-- 랭킹 보드 내용 ----------------------------------------------------------------

function World.SetBoardRows(board, title, rows)
	local surface = board:FindFirstChild("BoardGui")
	if not surface then
		surface = Instance.new("SurfaceGui")
		surface.Name = "BoardGui"
		surface.Face = Enum.NormalId.Left
		surface.CanvasSize = Vector2.new(400, 520)
		surface.LightInfluence = 0
		surface.Parent = board

		local layout = Instance.new("UIListLayout")
		layout.SortOrder = Enum.SortOrder.LayoutOrder
		layout.Padding = UDim.new(0, 4)
		layout.Parent = surface
	end
	for _, child in ipairs(surface:GetChildren()) do
		if child:IsA("TextLabel") then
			child:Destroy()
		end
	end
	local function line(order, text, color, height)
		local label = Instance.new("TextLabel")
		label.LayoutOrder = order
		label.Size = UDim2.new(1, 0, 0, height)
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.FredokaOne
		label.TextScaled = true
		label.TextColor3 = color
		label.Text = text
		label.Parent = surface
	end
	line(0, title, Color3.fromRGB(255, 220, 90), 60)
	for i, row in ipairs(rows) do
		local color = i == 1 and Color3.fromRGB(255, 215, 60)
			or i == 2 and Color3.fromRGB(220, 220, 230)
			or i == 3 and Color3.fromRGB(230, 160, 100)
			or Color3.new(1, 1, 1)
		line(i, row, color, 40)
	end
end

return World
