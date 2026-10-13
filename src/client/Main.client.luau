--[[
	왁뿌볼 던지기 — 클라이언트
	화면 UI, 클릭해서 던지기, 자동 던지기, 귀환/전진 선택창, 사망 연출
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

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local ThrowRemote = Remotes:WaitForChild("Throw")
local ActionRemote = Remotes:WaitForChild("Action")
local ThrowFx = Remotes:WaitForChild("ThrowFx")
local Notify = Remotes:WaitForChild("Notify")

local function attr(name)
	return player:GetAttribute(name) or 0
end

-- UI 만들기 도우미 ------------------------------------------------------------

local COLORS = {
	panel = Color3.fromRGB(30, 26, 48),
	stroke = Color3.fromRGB(255, 255, 255),
	text = Color3.fromRGB(255, 255, 255),
	speed = Color3.fromRGB(127, 232, 255),
	gold = Color3.fromRGB(255, 214, 90),
	green = Color3.fromRGB(80, 200, 110),
	orange = Color3.fromRGB(255, 140, 60),
	red = Color3.fromRGB(235, 80, 80),
	pink = Color3.fromRGB(255, 130, 190),
	disabled = Color3.fromRGB(110, 110, 120),
}

local function create(className, props, children)
	local instance = Instance.new(className)
	for key, value in pairs(props) do
		if key ~= "Parent" then
			instance[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = instance
	end
	instance.Parent = props.Parent
	return instance
end

local function corner(radius)
	return create("UICorner", { CornerRadius = UDim.new(0, radius or 12) })
end

local function border(color, thickness, transparency)
	return create("UIStroke", {
		Color = color or COLORS.stroke,
		Thickness = thickness or 2,
		Transparency = transparency or 0.6,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

local function padding(pixels)
	local p = UDim.new(0, pixels)
	return create("UIPadding", { PaddingLeft = p, PaddingRight = p, PaddingTop = p, PaddingBottom = p })
end

local function label(props)
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.FredokaOne
	props.TextColor3 = props.TextColor3 or COLORS.text
	if props.TextScaled == nil then
		props.TextScaled = true
	end
	return create("TextLabel", props)
end

local function button(props, silent)
	props.Font = props.Font or Enum.Font.FredokaOne
	props.TextColor3 = props.TextColor3 or COLORS.text
	props.TextScaled = true
	props.AutoButtonColor = true
	local b = create("TextButton", props, {
		corner(12),
		border(Color3.new(0, 0, 0), 3, 0.5),
		create("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8), PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6) }),
	})
	if not silent then
		b.Activated:Connect(Effects.PlayClick)
	end
	return b
end

local function panel(props, children)
	props.BackgroundColor3 = props.BackgroundColor3 or COLORS.panel
	props.BackgroundTransparency = props.BackgroundTransparency or 0.15
	local frame = create("Frame", props, { corner(14), border(), padding(10) })
	for _, child in ipairs(children or {}) do
		child.Parent = frame
	end
	return frame
end

-- 살짝 커졌다 돌아오는 효과
local function pop(guiObject, size)
	local scale = guiObject:FindFirstChild("PopScale") or create("UIScale", { Name = "PopScale", Parent = guiObject })
	scale.Scale = size or 1.25
	TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

-- 화면 --------------------------------------------------------------------

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
	uiScale.Scale = math.clamp(math.min(viewport.X / 1280, viewport.Y / 720), 0.55, 1)
end
updateScale()
camera:GetPropertyChangedSignal("ViewportSize"):Connect(updateScale)

-- 왼쪽 위: 내 능력치
local statsPanel = panel({
	Name = "Stats",
	Position = UDim2.fromOffset(12, 12),
	Size = UDim2.fromOffset(250, 170),
	Parent = screen,
})
local speedLabel = label({
	Size = UDim2.new(1, 0, 0, 32),
	TextXAlignment = Enum.TextXAlignment.Left,
	RichText = true,
	Parent = statsPanel,
})
local levelLabel = label({
	Position = UDim2.fromOffset(0, 36),
	Size = UDim2.new(1, 0, 0, 26),
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = statsPanel,
})
local levelBar = create("Frame", {
	Position = UDim2.fromOffset(0, 66),
	Size = UDim2.new(1, 0, 0, 16),
	BackgroundColor3 = Color3.fromRGB(15, 12, 25),
	Parent = statsPanel,
}, { corner(8) })
local levelFill = create("Frame", {
	Size = UDim2.fromScale(0, 1),
	BackgroundColor3 = COLORS.speed,
	Parent = levelBar,
}, { corner(8) })
local levelBarText = label({
	Size = UDim2.fromScale(1, 1),
	TextColor3 = Color3.new(1, 1, 1),
	TextStrokeTransparency = 0.4,
	ZIndex = 2,
	Parent = levelBar,
})
local trophyLabel = label({
	Position = UDim2.fromOffset(0, 88),
	Size = UDim2.new(1, 0, 0, 28),
	TextXAlignment = Enum.TextXAlignment.Left,
	RichText = true,
	Parent = statsPanel,
})
local rebirthLabel = label({
	Position = UDim2.fromOffset(0, 122),
	Size = UDim2.new(1, 0, 0, 24),
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.fromRGB(220, 200, 255),
	Parent = statsPanel,
})

-- 위 가운데: 스테이지 진행 중 정보 (미수령 트로피를 크게)
local runPanel = panel({
	Name = "Run",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 12),
	Size = UDim2.fromOffset(400, 150),
	Visible = false,
	Parent = screen,
})
local stageLabel = label({ Size = UDim2.new(1, 0, 0, 28), Parent = runPanel })
local recommendedLabel = label({ Position = UDim2.fromOffset(0, 30), Size = UDim2.new(1, 0, 0, 20), Parent = runPanel })
local unbankedLabel = label({
	Position = UDim2.fromOffset(0, 54),
	Size = UDim2.new(1, 0, 0, 46),
	TextColor3 = COLORS.gold,
	TextStrokeTransparency = 0.5,
	Parent = runPanel,
})
label({
	Position = UDim2.fromOffset(0, 102),
	Size = UDim2.new(1, 0, 0, 22),
	TextColor3 = Color3.fromRGB(255, 200, 200),
	Text = "미수령 트로피 · 죽으면 전부 사라져요!",
	Parent = runPanel,
})

-- 위 가운데: 로비 안내
local lobbyHint = panel({
	Name = "LobbyHint",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 12),
	Size = UDim2.fromOffset(560, 70),
	Parent = screen,
}, {
	label({
		Size = UDim2.fromScale(1, 1),
		Text = "💡 클릭할 때마다 "
			.. Config.BallName
			.. "을 던지고 속도 +1!\n보라색 포털 = 스테이지 출발 · 노란 원 = 자동 훈련",
		TextColor3 = Color3.fromRGB(255, 240, 200),
	}),
})

-- 아래 가운데: 던지기 / 자동
local throwButton = button({
	Name = "Throw",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -24),
	Size = UDim2.fromOffset(220, 74),
	BackgroundColor3 = COLORS.pink,
	Text = "🎯 던지기!",
	Parent = screen,
}, true)
local autoOn = false
local autoButton = button({
	Name = "Auto",
	AnchorPoint = Vector2.new(1, 1),
	Position = UDim2.new(0.5, -124, 1, -30),
	Size = UDim2.fromOffset(150, 56),
	BackgroundColor3 = COLORS.disabled,
	Text = "자동: 끔",
	Visible = Config.FreeAutoThrow,
	Parent = screen,
})

-- 오른쪽: 강화 / 환생
local shopPanel = panel({
	Name = "Shop",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -12, 0.5, 0),
	Size = UDim2.fromOffset(250, 270),
	Parent = screen,
})
label({ Size = UDim2.new(1, 0, 0, 28), Text = "⚾ " .. Config.BallName .. " 강화", Parent = shopPanel })
local upgradeInfo = label({
	Position = UDim2.fromOffset(0, 30),
	Size = UDim2.new(1, 0, 0, 22),
	TextColor3 = COLORS.speed,
	Parent = shopPanel,
})
local upgradeButton = button({
	Position = UDim2.fromOffset(0, 56),
	Size = UDim2.new(1, 0, 0, 46),
	BackgroundColor3 = COLORS.gold,
	TextColor3 = Color3.fromRGB(60, 40, 0),
	Parent = shopPanel,
})
label({
	Position = UDim2.fromOffset(0, 116),
	Size = UDim2.new(1, 0, 0, 28),
	Text = "🔁 환생",
	Parent = shopPanel,
})
local rebirthInfo = label({
	Position = UDim2.fromOffset(0, 146),
	Size = UDim2.new(1, 0, 0, 40),
	TextColor3 = Color3.fromRGB(220, 200, 255),
	Parent = shopPanel,
})
local rebirthButton = button({
	Position = UDim2.fromOffset(0, 192),
	Size = UDim2.new(1, 0, 0, 46),
	BackgroundColor3 = Color3.fromRGB(150, 90, 240),
	Parent = shopPanel,
})

-- 가운데: 스테이지 클리어 → 귀환 / 전진 선택창
local choicePanel = panel({
	Name = "Choice",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromOffset(480, 320),
	BackgroundTransparency = 0.05,
	Visible = false,
	ZIndex = 5,
	Parent = screen,
})
local choiceTitle = label({ Size = UDim2.new(1, 0, 0, 44), TextColor3 = COLORS.gold, Parent = choicePanel })
local choiceReward = label({ Position = UDim2.fromOffset(0, 50), Size = UDim2.new(1, 0, 0, 30), Parent = choicePanel })
local choiceTotal = label({
	Position = UDim2.fromOffset(0, 84),
	Size = UDim2.new(1, 0, 0, 44),
	TextColor3 = COLORS.gold,
	Parent = choicePanel,
})
local choiceWarning = label({
	Position = UDim2.fromOffset(0, 134),
	Size = UDim2.new(1, 0, 0, 56),
	TextColor3 = Color3.fromRGB(255, 190, 190),
	Parent = choicePanel,
})
local stopButton = button({
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 0, 1, 0),
	Size = UDim2.new(0.48, 0, 0, 70),
	BackgroundColor3 = COLORS.green,
	Parent = choicePanel,
})
local goButton = button({
	AnchorPoint = Vector2.new(1, 1),
	Position = UDim2.new(1, 0, 1, 0),
	Size = UDim2.new(0.48, 0, 0, 70),
	BackgroundColor3 = COLORS.orange,
	Parent = choicePanel,
})

-- 사망 화면
local deathOverlay = create("Frame", {
	Name = "Death",
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(120, 0, 0),
	BackgroundTransparency = 1,
	Visible = false,
	ZIndex = 10,
	Parent = screen,
})
local deathTitle = label({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.4),
	Size = UDim2.fromOffset(600, 80),
	Text = "💀 쓰러졌다…",
	ZIndex = 11,
	Parent = deathOverlay,
})
local deathLost = label({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.52),
	Size = UDim2.fromOffset(600, 60),
	TextColor3 = COLORS.gold,
	ZIndex = 11,
	Parent = deathOverlay,
})

-- 알림
local toastLabel = label({
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.3),
	Size = UDim2.fromOffset(700, 50),
	TextStrokeTransparency = 0.2,
	TextTransparency = 1,
	ZIndex = 8,
	Parent = screen,
})

local toastToken = 0
local function showToast(text, color)
	toastToken += 1
	local token = toastToken
	toastLabel.Text = text
	toastLabel.TextColor3 = color or COLORS.text
	toastLabel.TextTransparency = 0
	toastLabel.TextStrokeTransparency = 0.2
	pop(toastLabel, 1.2)
	task.delay(1.8, function()
		if token == toastToken then
			TweenService:Create(toastLabel, TweenInfo.new(0.4), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
		end
	end)
end

-- 화면 갱신 ------------------------------------------------------------------

local lastUnbanked = 0
local rebirthConfirmUntil = 0

local function refresh()
	local speed = attr("Speed")
	local level = math.max(1, attr("Level"))
	local trophies = attr("Trophies")
	local rebirths = attr("Rebirths")
	local upgrades = attr("BallUpgrade")
	local stage = attr("Stage")
	local inRun = stage > 0

	speedLabel.Text = '⚡ 속도  <font color="#7FE8FF">' .. Format.Short(speed) .. "</font>"
	levelLabel.Text = "⭐ 레벨 " .. level
	local current, nextSpeed = Config.SpeedForLevel(level), Config.SpeedForLevel(level + 1)
	levelFill.Size = UDim2.fromScale(math.clamp((speed - current) / math.max(1, nextSpeed - current), 0, 1), 1)
	levelBarText.Text = "다음 레벨까지 " .. Format.Short(math.max(0, nextSpeed - speed))
	trophyLabel.Text = '🏆 트로피  <font color="#FFD65A">' .. Format.Short(trophies) .. "</font>"
	rebirthLabel.Text = "🔁 환생 " .. rebirths .. "회 · 속도 x" .. Config.RebirthMultiplier(rebirths)

	runPanel.Visible = inRun
	lobbyHint.Visible = not inRun
	if inRun then
		local enemiesLeft = attr("EnemiesLeft")
		local enemiesText = enemiesLeft > 0 and ("👾 남은 적 " .. enemiesLeft) or "🚪 출구 열림! 초록 발판으로"
		stageLabel.Text = "스테이지 " .. stage .. " / " .. Config.StagesPerWorld .. "  ·  " .. enemiesText
		local recommended = Config.RecommendedLevel(stage)
		recommendedLabel.Text = "권장 Lv " .. recommended .. "  (내 Lv " .. level .. ")"
		recommendedLabel.TextColor3 = level >= recommended and Color3.fromRGB(170, 255, 170) or Color3.fromRGB(255, 150, 150)
	end
	local unbanked = attr("Unbanked")
	unbankedLabel.Text = "💰 " .. Format.Short(unbanked)
	if unbanked > lastUnbanked then
		pop(unbankedLabel, 1.4)
	end
	lastUnbanked = unbanked

	-- 강화
	local gainNow = Config.GainPerThrow({ BallUpgrade = upgrades, Rebirths = rebirths })
	local gainNext = Config.GainPerThrow({ BallUpgrade = upgrades + 1, Rebirths = rebirths })
	upgradeInfo.Text = "던질 때 속도 +" .. Format.Short(gainNow) .. " → +" .. Format.Short(gainNext)
	local cost = Config.UpgradeCost(upgrades)
	upgradeButton.Text = "🏆 " .. Format.Short(cost) .. " 로 강화"
	upgradeButton.BackgroundColor3 = trophies >= cost and COLORS.gold or COLORS.disabled

	-- 환생
	local need = Config.RebirthLevel(rebirths)
	rebirthInfo.Text = "속도·레벨 초기화 (트로피는 유지)\n속도 배수 x"
		.. Config.RebirthMultiplier(rebirths)
		.. " → x"
		.. Config.RebirthMultiplier(rebirths + 1)
	local canRebirth = level >= need and not inRun
	if inRun then
		rebirthButton.Text = "로비에서만 가능"
	elseif level < need then
		rebirthButton.Text = "Lv " .. need .. " 필요"
	elseif os.clock() < rebirthConfirmUntil then
		rebirthButton.Text = "정말? 한 번 더!"
	else
		rebirthButton.Text = "환생하기!"
	end
	rebirthButton.BackgroundColor3 = canRebirth and Color3.fromRGB(150, 90, 240) or COLORS.disabled
end

player.AttributeChanged:Connect(refresh)
refresh()

-- 던지기 ---------------------------------------------------------------------

local lastThrow = 0

local function tryThrow()
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	local now = os.clock()
	if now - lastThrow < 1 / Config.ThrowsPerSecond(attr("Speed")) then
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
	autoOn = not autoOn
	autoButton.Text = autoOn and "자동: 켬" or "자동: 끔"
	autoButton.BackgroundColor3 = autoOn and COLORS.green or COLORS.disabled
end)

task.spawn(function()
	while true do
		task.wait(1 / Config.ThrowsPerSecond(attr("Speed")))
		if autoOn and Config.FreeAutoThrow then
			tryThrow()
		end
	end
end)

ThrowFx.OnClientEvent:Connect(function(thrower, from, to, damage, gain)
	local mine = thrower == player
	if mine then
		Effects.PlayThrow()
	end
	Effects.Throw(from, to, function()
		if damage then
			Effects.Burst(to)
			if mine then
				Effects.Popup(to, Format.Short(damage), COLORS.gold, 1)
				Effects.PlayHit()
				Effects.Shake(0.15)
			end
		elseif mine then
			Effects.Popup(to, "+" .. Format.Short(gain) .. " ⚡", COLORS.speed, 0.8)
		end
	end)
end)

-- 강화 / 환생 버튼 --------------------------------------------------------------

upgradeButton.Activated:Connect(function()
	ActionRemote:FireServer("upgrade")
end)

rebirthButton.Activated:Connect(function()
	if attr("Stage") > 0 or attr("Level") < Config.RebirthLevel(attr("Rebirths")) then
		return
	end
	-- 실수로 누르지 않게 두 번 눌러야 환생합니다
	if os.clock() < rebirthConfirmUntil then
		rebirthConfirmUntil = 0
		ActionRemote:FireServer("rebirth")
	else
		rebirthConfirmUntil = os.clock() + 3
		task.delay(3.05, refresh)
	end
	refresh()
end)

-- 귀환 / 전진 ------------------------------------------------------------------

local function hideChoice()
	choicePanel.Visible = false
end

stopButton.Activated:Connect(function()
	hideChoice()
	ActionRemote:FireServer("choice", "stop")
end)

goButton.Activated:Connect(function()
	hideChoice()
	ActionRemote:FireServer("choice", "go")
end)

local function showChoice(info)
	choiceReward.Text = "스테이지 보상 +" .. Format.Short(info.reward) .. " 🏆"
	choiceTotal.Text = "💰 미수령 합계 " .. Format.Short(info.unbanked)
	stopButton.Text = "🏠 귀환\n" .. Format.Short(info.unbanked) .. " 받기"
	if info.canGo then
		choiceTitle.Text = "🎉 스테이지 " .. info.stage .. " 클리어!"
		choiceWarning.Text = "다음: 스테이지 "
			.. info.nextStage
			.. " (권장 Lv "
			.. info.nextRecommended
			.. ")\n죽으면 미수령 트로피를 전부 잃어요!"
		goButton.Text = "➡ 전진!\n스테이지 " .. info.nextStage
		goButton.Visible = true
		stopButton.AnchorPoint = Vector2.new(0, 1)
		stopButton.Position = UDim2.new(0, 0, 1, 0)
	else
		choiceTitle.Text = "🏆 " .. Config.WorldName .. " 클리어!"
		choiceWarning.Text = "마지막 스테이지까지 깼어요!\n귀환해서 트로피를 받으세요"
		goButton.Visible = false
		stopButton.AnchorPoint = Vector2.new(0.5, 1)
		stopButton.Position = UDim2.new(0.5, 0, 1, 0)
	end
	choicePanel.Visible = true
	pop(choicePanel, 0.8)
end

-- 사망 연출: 미수령 트로피가 한꺼번에 사라지는 모습을 확실히 보여줍니다
local function showDeath(info)
	hideChoice()
	Effects.PlayDeath()
	Effects.Shake(1)
	deathOverlay.Visible = true
	deathOverlay.BackgroundTransparency = 0.35
	deathTitle.TextTransparency = 0
	deathLost.TextTransparency = 0
	deathLost.TextColor3 = COLORS.gold

	local lost = info.lost or 0
	if lost > 0 then
		deathLost.Text = "💰 미수령 트로피 " .. Format.Short(lost)
		task.wait(0.6)
		-- 숫자가 0까지 줄어듭니다
		local steps = 20
		for i = steps - 1, 0, -1 do
			deathLost.Text = "💰 미수령 트로피 " .. Format.Short(math.floor(lost * i / steps))
			task.wait(0.04)
		end
		deathLost.TextColor3 = COLORS.red
		deathLost.Text = "-" .. Format.Short(lost) .. " 트로피 전부 사라졌다…"
		pop(deathLost, 1.4)
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

-- 서버 알림 ------------------------------------------------------------------

Notify.OnClientEvent:Connect(function(kind, info)
	info = info or {}
	if kind == "toast" then
		showToast(info.text, info.color)
	elseif kind == "levelUp" then
		showToast("⭐ 레벨 업! Lv " .. info.level, COLORS.speed)
		Effects.PlayLevelUp()
		pop(levelLabel, 1.3)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		if root then
			Effects.Burst(root.Position, COLORS.speed)
		end
	elseif kind == "stageStart" then
		hideChoice()
		showToast("스테이지 " .. info.stage .. " 시작! 적을 전부 쓰러뜨리세요", COLORS.text)
	elseif kind == "exitOpen" then
		showToast("🚪 출구가 열렸어요! 끝의 초록 발판으로 가세요", COLORS.green)
	elseif kind == "cleared" then
		showChoice(info)
	elseif kind == "banked" then
		if (info.amount or 0) > 0 then
			showToast("🏆 트로피 +" .. Format.Short(info.amount) .. " 받았어요!", COLORS.gold)
			pop(trophyLabel, 1.4)
		end
	elseif kind == "death" then
		task.spawn(showDeath, info)
	elseif kind == "hurt" then
		Effects.Shake(0.5)
	elseif kind == "rebirth" then
		showToast("🔁 환생 완료! 이제 속도 x" .. info.multiplier, Color3.fromRGB(220, 180, 255))
		Effects.PlayLevelUp()
	end
end)
