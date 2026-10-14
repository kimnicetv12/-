--[[
	왁뿌볼 던지기 — 클라이언트 화면
	왼쪽: 상점 · 텔레포트 · 코드 · 선물   오른쪽: 환생 · 자동
	위: 트로피, 운영자 이벤트, 스테이지 정보(미수령 트로피)   아래: 속도 + 던지기 버튼
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Format = require(Shared:WaitForChild("Format"))
local Effects = require(script.Parent:WaitForChild("Effects"))
local Ui = require(script.Parent:WaitForChild("Ui"))
local State = require(script.Parent:WaitForChild("State"))
local Menus = require(script.Parent:WaitForChild("Menus"))

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local ThrowRemote = Remotes:WaitForChild("Throw")
local ActionRemote = Remotes:WaitForChild("Action")
local ThrowFx = Remotes:WaitForChild("ThrowFx")
local Notify = Remotes:WaitForChild("Notify")

local C = Ui.Colors
local create = Ui.Create

-- 화면 ----------------------------------------------------------------------------

local screen = create("ScreenGui", {
	Name = "Hud",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = player:WaitForChild("PlayerGui"),
})

-- 작은 화면(모바일)에서는 UI 전체를 줄입니다
local uiScale = create("UIScale", { Parent = screen })
local camera = workspace.CurrentCamera or workspace:WaitForChild("Camera")
local function updateScale()
	local viewport = camera.ViewportSize
	uiScale.Scale = math.clamp(math.min(viewport.X / 1280, viewport.Y / 720), 0.5, 1)
end
updateScale()
camera:GetPropertyChangedSignal("ViewportSize"):Connect(updateScale)

-- 위 가운데: 트로피 ---------------------------------------------------------------------

local trophyPill = Ui.Panel({
	Name = "Trophies",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 6),
	Size = UDim2.fromOffset(280, 58),
	BackgroundColor3 = C.gold,
	BackgroundTransparency = 0,
	Parent = screen,
})
Ui.Shine().Parent = trophyPill
local trophyLabel = Ui.Text({ Size = UDim2.new(1, -16, 1, -8), Position = UDim2.fromOffset(8, 4), TextStroke = 3, Parent = trophyPill })

local eventBanner = Ui.Panel({
	Name = "Event",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 70),
	Size = UDim2.fromOffset(440, 40),
	BackgroundColor3 = C.red,
	BackgroundTransparency = 0,
	Visible = false,
	Parent = screen,
})
local eventLabel = Ui.Text({ Size = UDim2.new(1, -12, 1, -6), Position = UDim2.fromOffset(6, 3), Parent = eventBanner })

-- 위 가운데: 스테이지 진행 정보 (미수령 트로피를 크게)
local runPanel = Ui.Panel({
	Name = "Run",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 116),
	Size = UDim2.fromOffset(440, 150),
	Visible = false,
	Parent = screen,
})
local stageLabel = Ui.Text({ Position = UDim2.fromOffset(10, 8), Size = UDim2.new(1, -20, 0, 28), Parent = runPanel })
local recommendedLabel = Ui.Text({ Position = UDim2.fromOffset(10, 38), Size = UDim2.new(1, -20, 0, 20), Parent = runPanel })
local unbankedLabel = Ui.Text({ Position = UDim2.fromOffset(10, 60), Size = UDim2.new(1, -20, 0, 50), TextColor3 = C.gold, TextStroke = 3, Parent = runPanel })
local runHint = Ui.Text({
	Position = UDim2.fromOffset(10, 114),
	Size = UDim2.new(1, -20, 0, 26),
	TextColor3 = Color3.fromRGB(255, 200, 200),
	Text = "미수령 트로피 · 죽으면 전부 사라져요!",
	Parent = runPanel,
})

-- 왼쪽: 메뉴 버튼 ------------------------------------------------------------------------

local function column(anchorX, positionX)
	local frame = create("Frame", {
		AnchorPoint = Vector2.new(anchorX, 0.5),
		Position = UDim2.new(anchorX, positionX, 0.5, 0),
		Size = UDim2.fromOffset(90, 440),
		BackgroundTransparency = 1,
		Parent = screen,
	})
	create("UIListLayout", {
		Padding = UDim.new(0, 26),
		SortOrder = Enum.SortOrder.LayoutOrder,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = frame,
	})
	return frame
end

local leftColumn = column(0, 14)
local rightColumn = column(1, -14)

Ui.IconButton({ Name = "Shop", Icon = "🛒", Caption = "상점", Color = C.orange, LayoutOrder = 1, Parent = leftColumn }, function()
	Menus.Toggle("shop")
end)
Ui.IconButton({ Name = "Teleport", Icon = "🌀", Caption = "텔레포트", Color = C.purple, LayoutOrder = 2, Parent = leftColumn }, function()
	Menus.Toggle("teleport")
end)
Ui.IconButton({ Name = "Codes", Icon = "🎟️", Caption = "코드", Color = C.blue, LayoutOrder = 3, Parent = leftColumn }, function()
	Menus.Toggle("codes")
end)
local _, giftCaption, giftBadge = Ui.IconButton({ Name = "Gift", Icon = "🎁", Caption = "선물", Color = C.pink, LayoutOrder = 4, Parent = leftColumn }, function()
	ActionRemote:FireServer("gift")
end)

-- 오른쪽: 환생 / 자동 -------------------------------------------------------------------------

local _, rebirthCaption, rebirthBadge = Ui.IconButton({ Name = "Rebirth", Icon = "🔁", Caption = "환생", Color = C.red, LayoutOrder = 1, Parent = rightColumn }, function()
	Menus.Toggle("rebirth")
end)

local autoOn = false
local autoButton, autoCaption = Ui.IconButton({ Name = "Auto", Icon = "🤖", Caption = "자동 끔", Color = C.disabled, LayoutOrder = 2, Parent = rightColumn })

-- 아래: 속도 + 던지기 ---------------------------------------------------------------------------

local speedPanel = Ui.Panel({
	Name = "Speed",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -104),
	Size = UDim2.fromOffset(380, 92),
	Parent = screen,
})
local speedLabel = Ui.Text({ Position = UDim2.fromOffset(10, 4), Size = UDim2.new(1, -20, 0, 44), TextColor3 = C.speed, TextStroke = 3, Parent = speedPanel })
local levelBar = create("Frame", {
	Position = UDim2.fromOffset(12, 54),
	Size = UDim2.new(1, -24, 0, 28),
	BackgroundColor3 = Color3.fromRGB(15, 12, 25),
	Parent = speedPanel,
}, { Ui.Corner(10), Ui.Outline(2) })
local levelFill = create("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = C.green, Parent = levelBar }, { Ui.Corner(10), Ui.Shine() })
local levelText = Ui.Text({ Size = UDim2.new(1, -10, 1, -4), Position = UDim2.fromOffset(5, 2), ZIndex = 2, Parent = levelBar })

local throwButton = Ui.Button({
	Name = "Throw",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -16),
	Size = UDim2.fromOffset(250, 78),
	BackgroundColor3 = C.pink,
	Text = "🎯 던지기!",
	Radius = 20,
	Parent = screen,
})

-- 알림 / 획득 / 사망 ------------------------------------------------------------------------

local toastLabel = Ui.Text({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.36),
	Size = UDim2.fromOffset(760, 52),
	TextStroke = 3,
	ZIndex = 30,
	Parent = screen,
})
toastLabel.TextTransparency = 1
local toastStroke = toastLabel:FindFirstChildOfClass("UIStroke")
toastStroke.Transparency = 1

local toastToken = 0
local function showToast(text, color)
	toastToken += 1
	local token = toastToken
	toastLabel.Text = text
	toastLabel.TextColor3 = color or C.text
	toastLabel.TextTransparency = 0
	toastStroke.Transparency = 0
	Ui.Pop(toastLabel, 1.25)
	task.delay(2, function()
		if token == toastToken then
			TweenService:Create(toastLabel, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
			TweenService:Create(toastStroke, TweenInfo.new(0.4), { Transparency = 1 }):Play()
		end
	end)
end

-- 새 왁뿌볼 획득 연출
local rewardCard = Ui.Panel({
	Name = "Reward",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromOffset(420, 300),
	BackgroundTransparency = 0,
	Visible = false,
	ZIndex = 40,
	Parent = screen,
})
local rewardTitle = Ui.Text({ Position = UDim2.fromOffset(10, 14), Size = UDim2.new(1, -20, 0, 46), TextColor3 = C.gold, TextStroke = 3, ZIndex = 41, Parent = rewardCard })
local rewardBall = create("Frame", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 74),
	Size = UDim2.fromOffset(120, 120),
	ZIndex = 41,
	Parent = rewardCard,
}, { Ui.Round(), Ui.Outline(4), Ui.Shine() })
local rewardName = Ui.Text({ Position = UDim2.fromOffset(10, 206), Size = UDim2.new(1, -20, 0, 36), ZIndex = 41, Parent = rewardCard })
local rewardMult = Ui.Text({ Position = UDim2.fromOffset(10, 246), Size = UDim2.new(1, -20, 0, 30), TextColor3 = C.speed, ZIndex = 41, Parent = rewardCard })

local function showReward(title, skinId)
	local skin = Config.FindById(Config.Skins, skinId)
	if not skin then
		return
	end
	rewardTitle.Text = title
	rewardBall.BackgroundColor3 = skin.color
	rewardName.Text = skin.name .. " · " .. Config.Rarities[skin.rarity].name
	rewardName.TextColor3 = Config.Rarities[skin.rarity].color
	rewardMult.Text = "속도 x" .. Format.Short(skin.mult)
	rewardCard.Visible = true
	Ui.Pop(rewardCard, 0.4)
	Effects.PlayLevelUp()
	task.delay(2.8, function()
		rewardCard.Visible = false
	end)
end

local deathOverlay = create("Frame", {
	Name = "Death",
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(120, 0, 0),
	BackgroundTransparency = 1,
	Visible = false,
	ZIndex = 50,
	Parent = screen,
})
local deathTitle = Ui.Text({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.38),
	Size = UDim2.fromOffset(640, 90),
	Text = "💀 쓰러졌다…",
	TextStroke = 4,
	ZIndex = 51,
	Parent = deathOverlay,
})
local deathLost = Ui.Text({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromOffset(640, 64),
	TextColor3 = C.gold,
	TextStroke = 3,
	ZIndex = 51,
	Parent = deathOverlay,
})
local deathKept = Ui.Text({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.6),
	Size = UDim2.fromOffset(640, 40),
	TextColor3 = C.green,
	ZIndex = 51,
	Parent = deathOverlay,
})

-- 사망 연출: 미수령 트로피가 한꺼번에 사라지는 모습을 확실히 보여줍니다
local function showDeath(info)
	Menus.CloseAll()
	Effects.PlayDeath()
	Effects.Shake(1)
	deathOverlay.Visible = true
	deathOverlay.BackgroundTransparency = 0.35
	deathTitle.TextTransparency = 0
	deathLost.TextTransparency = 0
	deathLost.TextColor3 = C.gold
	deathKept.Text = (info.kept or 0) > 0 and ("🛡️ 사망 보험으로 " .. Format.Short(info.kept) .. " 지켰어요") or ""

	local lost = info.lost or 0
	if lost > 0 then
		deathLost.Text = "💰 미수령 트로피 " .. Format.Short(lost)
		task.wait(0.6)
		local steps = 20
		for i = steps - 1, 0, -1 do
			deathLost.Text = "💰 미수령 트로피 " .. Format.Short(math.floor(lost * i / steps))
			task.wait(0.04)
		end
		deathLost.TextColor3 = C.red
		deathLost.Text = "-" .. Format.Short(lost) .. " 트로피 전부 사라졌다…"
		Ui.Pop(deathLost, 1.4)
	else
		deathLost.Text = "스테이지 " .. (info.stage or 1) .. "에서 쓰러졌어요"
	end

	task.wait(1.6)
	local fade = TweenInfo.new(0.8)
	TweenService:Create(deathOverlay, fade, { BackgroundTransparency = 1 }):Play()
	TweenService:Create(deathTitle, fade, { TextTransparency = 1 }):Play()
	TweenService:Create(deathLost, fade, { TextTransparency = 1 }):Play()
	task.wait(0.8)
	deathOverlay.Visible = false
end

Menus.Init(screen, ActionRemote)

-- 로비 표지판을 내 상태에 맞게 (구매한 발판, 잠긴 허수아비/월드) -------------------------------------

local lobby

local function updateLobby()
	if not lobby then
		return
	end
	local ownedPad = State.Get("Pad")
	local trophies = State.Get("Trophies")
	local pads = lobby:FindFirstChild("Pads")
	for _, padPart in ipairs(pads and pads:GetChildren() or {}) do
		local index = padPart:GetAttribute("PadIndex")
		local pad = index and Config.Pads[index]
		local label = padPart:FindFirstChild("Sign") and padPart.Sign:FindFirstChild("Label")
		if pad and label then
			if index <= ownedPad then
				label.Text = "✔ +" .. Format.Short(pad.value)
				padPart.Color = C.green
			else
				label.Text = "+" .. Format.Short(pad.value) .. "\n🏆 " .. Format.Short(pad.cost)
				padPart.Color = trophies >= pad.cost and C.gold or C.disabled
			end
		end
	end

	local dummies = lobby:FindFirstChild("Dummies")
	for _, model in ipairs(dummies and dummies:GetChildren() or {}) do
		local info = Config.Dummies[model:GetAttribute("Tier") or 0]
		local head = model:FindFirstChild("Head")
		local label = head and head:FindFirstChild("Sign") and head.Sign:FindFirstChild("Label")
		if info and label then
			local locked = info.pass and not State.OwnsPass(info.pass)
			label.Text = (locked and "🔒 " or "") .. info.name .. "\n훈련 x" .. info.mult
		end
	end

	local portals = lobby:FindFirstChild("Portals")
	local level = State.Get("Level")
	for world, info in ipairs(Config.Worlds) do
		local model = portals and portals:FindFirstChild("World" .. world)
		local top = model and model:FindFirstChild("Top")
		local label = top and top:FindFirstChild("Sign") and top.Sign:FindFirstChild("PortalLabel")
		if label then
			local status = level >= info.level and "▶ 출발!" or ("🔒 Lv " .. info.level .. " 필요")
			label.Text = "월드 " .. world .. " · " .. info.name .. "\n" .. status
		end
	end
end

task.spawn(function()
	lobby = workspace:WaitForChild("Lobby", 30)
	if lobby then
		lobby:WaitForChild("Pads", 10)
		lobby:WaitForChild("Portals", 10)
		updateLobby()
	end
end)

-- 화면 갱신 ----------------------------------------------------------------------------------

local lastUnbanked = 0

local function refresh()
	local speed = State.Get("Speed")
	local level = math.max(1, State.Get("Level"))
	local rebirths = State.Get("Rebirths")
	local stage = State.Get("Stage")
	local world = State.Get("World")
	local inRun = stage > 0 and Config.Worlds[world] ~= nil

	trophyLabel.Text = "🏆 " .. Format.Short(State.Get("Trophies"))

	speedLabel.Text = "⚡ " .. Format.Short(speed) .. "  (+" .. Format.Short(State.Gain()) .. ")"
	local current, nextSpeed = Config.SpeedForLevel(level), Config.SpeedForLevel(level + 1)
	levelFill.Size = UDim2.fromScale(math.clamp((speed - current) / math.max(1, nextSpeed - current), 0, 1), 1)
	levelText.Text = "Lv " .. level .. "  ·  다음까지 " .. Format.Short(math.max(0, nextSpeed - speed))

	local need = Config.RebirthLevel(rebirths)
	rebirthCaption.Text = "Lv " .. level .. "/" .. need
	rebirthBadge.Visible = level >= need and not inRun

	local giftLeft = State.Get("LastGift") + Config.GiftCooldown - os.time()
	giftBadge.Visible = giftLeft <= 0
	giftCaption.Text = giftLeft <= 0 and "선물!" or string.format("%d:%02d", giftLeft // 3600, (giftLeft % 3600) // 60)

	local eventMult = State.EventMultiplier()
	eventBanner.Visible = eventMult > 1
	if eventMult > 1 then
		local left = (workspace:GetAttribute("EventEnds") or 0) - os.time()
		eventLabel.Text = string.format("⚡ 운영자 이벤트! 속도 x%s · %d:%02d", Format.Short(eventMult), left // 60, left % 60)
	end

	runPanel.Visible = inRun
	runPanel.Position = UDim2.new(0.5, 0, 0, eventMult > 1 and 116 or 72)
	if inRun then
		local enemiesLeft = State.Get("EnemiesLeft")
		stageLabel.Text = "월드 " .. world .. " · 스테이지 " .. stage .. "/" .. Config.StagesPerWorld .. "  ·  " .. (enemiesLeft > 0 and ("👾 " .. enemiesLeft) or "🚪 출구 열림")
		local recommended = Config.RecommendedLevel(world, stage)
		recommendedLabel.Text = "권장 Lv " .. Format.Short(recommended) .. "  (내 Lv " .. level .. ")"
		recommendedLabel.TextColor3 = level >= recommended and Color3.fromRGB(170, 255, 170) or Color3.fromRGB(255, 150, 150)
		if enemiesLeft > 0 then
			runHint.Text = "미수령 트로피 · 죽으면 전부 사라져요!"
		end
	end
	local unbanked = State.Get("Unbanked")
	unbankedLabel.Text = "💰 " .. Format.Short(unbanked)
	if unbanked > lastUnbanked then
		Ui.Pop(unbankedLabel, 1.4)
	end
	lastUnbanked = unbanked
end

local LOBBY_KEYS = { Pad = true, Trophies = true, Level = true, PassesJson = true }

State.OnChanged(function(name)
	refresh()
	if name then
		Menus.OnAttributeChanged(name)
		if LOBBY_KEYS[name] then
			updateLobby()
		end
	end
end)
refresh()

-- 선물/이벤트 시간 표시를 위해 1초마다 갱신
task.spawn(function()
	while true do
		task.wait(1)
		refresh()
	end
end)

-- 던지기 ------------------------------------------------------------------------------------

local lastThrow = 0

local function tryThrow()
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	local now = os.clock()
	if now - lastThrow < 1 / Config.ThrowsPerSecond(State.Get("Speed")) then
		return
	end
	lastThrow = now
	ThrowRemote:FireServer()
end

throwButton.Activated:Connect(tryThrow)

-- 화면 아무 데나 클릭/터치해도 던집니다 (UI 버튼 위는 제외)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		tryThrow()
	end
end)

autoButton.Activated:Connect(function()
	if not State.CanAutoThrow() then
		ActionRemote:FireServer("buyPass", "AutoThrow")
		return
	end
	autoOn = not autoOn
	autoCaption.Text = autoOn and "자동 켬" or "자동 끔"
	autoButton.BackgroundColor3 = autoOn and C.green or C.disabled
end)

task.spawn(function()
	while true do
		task.wait(1 / Config.ThrowsPerSecond(State.Get("Speed")))
		if autoOn and State.CanAutoThrow() then
			tryThrow()
		end
	end
end)

ThrowFx.OnClientEvent:Connect(function(thrower, from, to, damage, gain, skinId)
	local mine = thrower == player
	if mine then
		Effects.PlayThrow()
	end
	Effects.Throw(from, to, skinId, function()
		if damage then
			Effects.Burst(to)
			if mine then
				Effects.Popup(to, Format.Short(damage), C.gold, 1)
				Effects.PlayHit()
				Effects.Shake(0.15)
			end
		elseif mine then
			Effects.Popup(to, "+" .. Format.Short(gain) .. " ⚡", C.speed, 0.8)
		end
	end)
end)

-- 서버 알림 ----------------------------------------------------------------------------------

Notify.OnClientEvent:Connect(function(kind, info)
	info = info or {}
	if kind == "toast" then
		showToast(info.text, info.color)
	elseif kind == "levelUp" then
		showToast("⭐ 레벨 업! Lv " .. info.level, C.speed)
		Effects.PlayLevelUp()
		Ui.Pop(levelBar, 1.2)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		if root then
			Effects.Burst(root.Position, C.speed)
		end
	elseif kind == "stageStart" then
		Menus.CloseAll()
		showToast("월드 " .. info.world .. " · 스테이지 " .. info.stage .. " 시작! 적을 전부 쓰러뜨리세요", C.text)
	elseif kind == "cleared" then
		showToast("🎉 스테이지 " .. info.stage .. " 클리어! 미수령 +" .. Format.Short(info.reward), C.gold)
		if info.isLast then
			runHint.Text = "👑 월드 클리어! 🟡 노란 발판에서 트로피 받기"
		else
			runHint.Text = "🟡 귀환 = 받기 · 🟢 전진 = 권장 Lv " .. Format.Short(info.nextRecommended)
		end
	elseif kind == "banked" then
		if (info.amount or 0) > 0 then
			showToast("🏆 트로피 +" .. Format.Short(info.amount) .. " 받았어요!", C.gold)
			Ui.Pop(trophyPill, 1.3)
		end
	elseif kind == "death" then
		task.spawn(showDeath, info)
	elseif kind == "hurt" then
		Effects.Shake(0.5)
	elseif kind == "rebirth" then
		Menus.CloseAll()
		showToast("🔁 환생 완료! 이제 속도 x" .. Format.Short(info.multiplier), Color3.fromRGB(220, 180, 255))
		Effects.PlayLevelUp()
	elseif kind == "newSkin" then
		showReward("✨ 새 " .. Config.BallName .. "!", info.id)
	elseif kind == "gift" then
		showToast("🎁 선물! 속도 +" .. Format.Short(info.speed), C.pink)
		Effects.PlayLevelUp()
	end
end)
