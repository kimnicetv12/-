--[[
	창(메뉴): 상점(왁뿌볼/오라/게임패스), 텔레포트, 코드, 환생
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Format = require(Shared:WaitForChild("Format"))
local Ui = require(script.Parent:WaitForChild("Ui"))
local State = require(script.Parent:WaitForChild("State"))

local C = Ui.Colors
local create = Ui.Create

local Menus = {}

local windows = {} -- [name] = { frame, refresh }
local ActionRemote

local function clearGrid(grid)
	for _, child in ipairs(grid:GetChildren()) do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
end

-- 상점 카드 하나
local function card(grid, order, info)
	local frame = Ui.Panel({
		Name = "Card" .. order,
		LayoutOrder = order,
		BackgroundColor3 = C.panelLight,
		BackgroundTransparency = 0,
		Parent = grid,
	})
	if info.highlight then
		local stroke = frame:FindFirstChildOfClass("UIStroke")
		stroke.Color = C.gold
		stroke.Thickness = 4
	end

	local rarity = info.rarity and Config.Rarities[info.rarity]
	if rarity then
		local strip = create("Frame", {
			Size = UDim2.new(1, 0, 0, 24),
			BackgroundColor3 = rarity.color,
			Parent = frame,
		}, { Ui.Corner(14) })
		Ui.Text({ Size = UDim2.fromScale(1, 1), Text = rarity.name, Parent = strip })
	end

	if info.color then
		local ball = create("Frame", {
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 32),
			Size = UDim2.fromOffset(62, 62),
			BackgroundColor3 = info.color,
			Parent = frame,
		}, { Ui.Round(), Ui.Outline(3), Ui.Shine() })
		if info.ring then
			ball.BackgroundTransparency = 0.7
			ball:FindFirstChildOfClass("UIStroke").Color = info.color
			ball:FindFirstChildOfClass("UIStroke").Thickness = 6
		end
		if info.rainbow then
			create("UIGradient", {
				Color = ColorSequence.new({
					ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 80, 80)),
					ColorSequenceKeypoint.new(0.33, Color3.fromRGB(255, 230, 80)),
					ColorSequenceKeypoint.new(0.66, Color3.fromRGB(80, 220, 255)),
					ColorSequenceKeypoint.new(1, Color3.fromRGB(200, 90, 255)),
				}),
				Rotation = 45,
				Parent = ball,
			})
		end
	else
		Ui.Text({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 30),
			Size = UDim2.fromOffset(70, 64),
			Text = info.icon or "?",
			Parent = frame,
		})
	end

	Ui.Text({ Position = UDim2.fromOffset(6, 100), Size = UDim2.new(1, -12, 0, 22), Text = info.title, Parent = frame })
	Ui.Text({
		Position = UDim2.fromOffset(6, 124),
		Size = UDim2.new(1, -12, 0, 18),
		Text = info.sub or "",
		TextColor3 = C.speed,
		Parent = frame,
	})
	Ui.Button({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -6),
		Size = UDim2.new(1, -12, 0, 36),
		BackgroundColor3 = info.buttonColor,
		Text = info.buttonText,
		Parent = frame,
	}, info.onClick)
	return frame
end

local function send(...)
	ActionRemote:FireServer(...)
end

-- 상점 ---------------------------------------------------------------------------------

local function buildShop(screen)
	local window, content, header = Ui.Window(screen, "🛒 상점", C.orange, UDim2.fromOffset(700, 480))
	Ui.Button({
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -56, 0.5, 0),
		Size = UDim2.fromOffset(160, 42),
		BackgroundColor3 = C.green,
		Text = "✅ 최강 장착",
		ZIndex = 22,
		Parent = header,
	}, function()
		send("equipBest")
	end)

	local grid = Ui.Grid(content, UDim2.fromOffset(146, 196), {
		Position = UDim2.fromOffset(0, 54),
		Size = UDim2.new(1, 0, 1, -54),
	})
	local currentTab = 1

	local function fill()
		clearGrid(grid)
		local trophies = State.Get("Trophies")
		if currentTab == 1 then
			local equipped = State.Get("Skin")
			for order, skin in ipairs(Config.Skins) do
				local owned = State.OwnsSkin(skin)
				local text, color = "", C.disabled
				if owned and equipped == skin.id then
					text, color = "장착됨", C.disabled
				elseif owned then
					text, color = "장착", C.green
				elseif skin.boss then
					text, color = "👑 월드" .. skin.boss .. " 보스", C.purple
				elseif skin.pass then
					text, color = "R$ " .. Config.GamePasses[skin.pass].robux, C.green
				else
					text, color = "🏆 " .. Format.Short(skin.cost), trophies >= skin.cost and C.gold or C.disabled
				end
				card(grid, order, {
					title = skin.name,
					sub = "속도 x" .. Format.Short(skin.mult),
					rarity = skin.rarity,
					color = skin.color,
					rainbow = skin.rainbow,
					highlight = equipped == skin.id,
					buttonText = text,
					buttonColor = color,
					onClick = function()
						send(owned and "equipSkin" or "buySkin", skin.id)
					end,
				})
			end
		elseif currentTab == 2 then
			local equipped = State.Get("Aura")
			for order, aura in ipairs(Config.Auras) do
				local owned = State.OwnsAura(aura)
				local text, color
				if owned and equipped == aura.id then
					text, color = "해제", C.disabled
				elseif owned then
					text, color = "장착", C.green
				else
					text, color = "🏆 " .. Format.Short(aura.cost), trophies >= aura.cost and C.gold or C.disabled
				end
				card(grid, order, {
					title = aura.name,
					sub = "속도 x" .. Format.Short(aura.mult),
					rarity = aura.rarity,
					color = aura.color,
					ring = true,
					highlight = equipped == aura.id,
					buttonText = text,
					buttonColor = color,
					onClick = function()
						if owned then
							send("equipAura", equipped == aura.id and "" or aura.id)
						else
							send("buyAura", aura.id)
						end
					end,
				})
			end
		else
			for order, key in ipairs(Config.PassOrder) do
				local pass = Config.GamePasses[key]
				local owned = State.OwnsPass(key)
				card(grid, order, {
					title = pass.name,
					sub = pass.desc,
					icon = pass.icon,
					highlight = owned,
					buttonText = owned and "보유 중" or ("R$ " .. pass.robux),
					buttonColor = owned and C.disabled or C.green,
					onClick = function()
						if not owned then
							send("buyPass", key)
						end
					end,
				})
			end
		end
	end

	local _, selectTab = Ui.Tabs(content, { "🎾 왁뿌볼", "✨ 오라", "💎 게임패스" }, function(index)
		currentTab = index
		fill()
	end)
	selectTab(1)

	return { frame = window, refresh = fill }
end

-- 텔레포트 ------------------------------------------------------------------------------

local function buildTeleport(screen)
	local window, content = Ui.Window(screen, "🌀 텔레포트", C.purple, UDim2.fromOffset(700, 480))
	local grid = Ui.Grid(content, UDim2.fromOffset(118, 92), {
		Position = UDim2.fromOffset(0, 54),
		Size = UDim2.new(1, 0, 1, -54),
	})
	local lockLabel = Ui.Text({
		Position = UDim2.fromOffset(0, 120),
		Size = UDim2.new(1, 0, 0, 90),
		Visible = false,
		ZIndex = 22,
		Parent = content,
	})
	local currentWorld = 1

	local function fill()
		clearGrid(grid)
		local world = Config.Worlds[currentWorld]
		local level = State.Get("Level")
		lockLabel.Visible = level < world.level
		if level < world.level then
			lockLabel.Text = "🔒 월드 " .. currentWorld .. " · " .. world.name .. "\n레벨 " .. world.level .. "부터 갈 수 있어요"
			return
		end
		local best = State.BestStage(currentWorld)
		local trophies = State.Get("Trophies")
		for stage = 1, Config.StagesPerWorld do
			local reachable = stage <= best + 1
			local cost = Config.TeleportCost(currentWorld, stage)
			local text, color
			if not reachable then
				text, color = "🔒\n스테이지 " .. stage, C.disabled
			else
				local price = cost == 0 and "무료" or ("🏆 " .. Format.Short(cost))
				text = "스테이지 " .. stage .. "\n" .. price
				color = trophies >= cost and (stage == Config.StagesPerWorld and C.red or C.blue) or C.disabled
			end
			Ui.Button({
				Name = "Stage" .. stage,
				LayoutOrder = stage,
				BackgroundColor3 = color,
				Text = text,
				Parent = grid,
			}, function()
				if reachable then
					send("teleport", currentWorld, stage)
					window.Visible = false
				end
			end)
		end
	end

	local tabNames = {}
	for index in ipairs(Config.Worlds) do
		tabNames[index] = "🌍 월드 " .. index
	end
	local _, selectTab = Ui.Tabs(content, tabNames, function(index)
		currentWorld = index
		fill()
	end)
	selectTab(1)

	return { frame = window, refresh = fill }
end

-- 코드 ---------------------------------------------------------------------------------

local function buildCodes(screen)
	local window, content = Ui.Window(screen, "🎟️ 코드", C.blue, UDim2.fromOffset(480, 280))
	local box = create("TextBox", {
		Size = UDim2.new(1, 0, 0, 64),
		BackgroundColor3 = Color3.fromRGB(245, 245, 250),
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextColor3 = Color3.fromRGB(40, 40, 60),
		PlaceholderText = "코드를 입력하세요",
		Text = "",
		ClearTextOnFocus = false,
		ZIndex = 22,
		Parent = content,
	}, { Ui.Corner(12), Ui.Outline(3), Ui.Padding(10) })
	Ui.Button({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 0),
		Size = UDim2.new(0.6, 0, 0, 60),
		BackgroundColor3 = C.green,
		Text = "사용하기",
		ZIndex = 22,
		Parent = content,
	}, function()
		if box.Text ~= "" then
			send("code", box.Text)
			box.Text = ""
		end
	end)
	return { frame = window, refresh = function() end }
end

-- 환생 ---------------------------------------------------------------------------------

local function buildRebirth(screen)
	local window, content = Ui.Window(screen, "🔁 환생", C.red, UDim2.fromOffset(520, 420))
	local info = Ui.Text({
		Size = UDim2.new(1, 0, 0, 230),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		RichText = true,
		ZIndex = 22,
		Parent = content,
	})
	local button = Ui.Button({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 0),
		Size = UDim2.new(0.8, 0, 0, 70),
		BackgroundColor3 = C.red,
		Text = "🔁 환생하기",
		ZIndex = 22,
		Parent = content,
	}, function()
		send("rebirth")
	end)

	local function refresh()
		local rebirths = State.Get("Rebirths")
		local level = State.Get("Level")
		local need = Config.RebirthLevel(rebirths)
		local ready = level >= need
		info.Text = string.format(
			'환생 <font color="#FFCD3C">%d회 → %d회</font>\n속도 배수 <font color="#6EE1FF">x%s → x%s</font>\n필요 레벨 <font color="%s">Lv %d</font> (지금 Lv %d)\n\n초기화: 속도, 레벨\n유지: 트로피, 왁뿌볼, 오라, 던지기 파워',
			rebirths,
			rebirths + 1,
			Format.Short(Config.RebirthMultiplier(rebirths)),
			Format.Short(Config.RebirthMultiplier(rebirths + 1)),
			ready and "#78FF8C" or "#FF7878",
			need,
			level
		)
		button.BackgroundColor3 = ready and C.red or C.disabled
		button.Label.Text = ready and "🔁 환생하기" or ("Lv " .. need .. " 필요")
	end
	return { frame = window, refresh = refresh }
end

-- 바깥에서 쓰는 함수 --------------------------------------------------------------------

function Menus.Init(screen, actionRemote)
	ActionRemote = actionRemote
	windows.shop = buildShop(screen)
	windows.teleport = buildTeleport(screen)
	windows.codes = buildCodes(screen)
	windows.rebirth = buildRebirth(screen)
end

function Menus.Toggle(name)
	local target = windows[name]
	local opening = not target.frame.Visible
	for _, window in pairs(windows) do
		window.frame.Visible = false
	end
	if opening then
		target.refresh()
		target.frame.Visible = true
		Ui.Pop(target.frame, 0.85)
	end
end

function Menus.CloseAll()
	for _, window in pairs(windows) do
		window.frame.Visible = false
	end
end

-- 창에 보이는 값이 바뀌었을 때만 다시 그립니다 (속도는 너무 자주 바뀌어서 제외)
local WATCHED = {
	Trophies = true,
	Skin = true,
	Aura = true,
	SkinsJson = true,
	AurasJson = true,
	PassesJson = true,
	BestStagesJson = true,
	Level = true,
	Rebirths = true,
}

function Menus.OnAttributeChanged(name)
	if not WATCHED[name] then
		return
	end
	for _, window in pairs(windows) do
		if window.frame.Visible then
			window.refresh()
		end
	end
end

return Menus
