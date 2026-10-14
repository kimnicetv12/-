--[[
	UI 만들기 도구 모음 (시뮬레이터 게임 스타일: 굵은 테두리, 통통한 버튼, 큰 글씨)
]]

local TweenService = game:GetService("TweenService")

local Ui = {}

Ui.Colors = {
	panel = Color3.fromRGB(32, 28, 52),
	panelLight = Color3.fromRGB(55, 48, 85),
	text = Color3.fromRGB(255, 255, 255),
	speed = Color3.fromRGB(110, 225, 255),
	gold = Color3.fromRGB(255, 205, 60),
	green = Color3.fromRGB(70, 205, 100),
	orange = Color3.fromRGB(255, 140, 50),
	red = Color3.fromRGB(235, 70, 80),
	purple = Color3.fromRGB(150, 90, 245),
	pink = Color3.fromRGB(255, 110, 180),
	blue = Color3.fromRGB(70, 150, 255),
	disabled = Color3.fromRGB(105, 105, 120),
	outline = Color3.fromRGB(20, 15, 35),
}

local C = Ui.Colors

function Ui.Create(className, props, children)
	local instance = Instance.new(className)
	for key, value in pairs(props or {}) do
		if key ~= "Parent" then
			instance[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = instance
	end
	if props and props.Parent then
		instance.Parent = props.Parent
	end
	return instance
end

local create = Ui.Create

function Ui.Corner(radius)
	return create("UICorner", { CornerRadius = UDim.new(0, radius or 12) })
end

function Ui.Round()
	return create("UICorner", { CornerRadius = UDim.new(1, 0) })
end

function Ui.Outline(thickness, color)
	return create("UIStroke", {
		Color = color or C.outline,
		Thickness = thickness or 3,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function Ui.Padding(pixels)
	local p = UDim.new(0, pixels)
	return create("UIPadding", { PaddingLeft = p, PaddingRight = p, PaddingTop = p, PaddingBottom = p })
end

-- 위는 밝고 아래는 어두운 버튼 그라데이션
function Ui.Shine()
	return create("UIGradient", {
		Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(190, 190, 190)),
		Rotation = 90,
	})
end

-- 글자 테두리가 있는 라벨
function Ui.Text(props)
	local strokeThickness = props.TextStroke or 2
	props.TextStroke = nil
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.FredokaOne
	props.TextColor3 = props.TextColor3 or C.text
	if props.TextScaled == nil then
		props.TextScaled = true
	end
	local label = create("TextLabel", props)
	create("UIStroke", { Color = C.outline, Thickness = strokeThickness, Parent = label })
	return label
end

-- 통통한 버튼
function Ui.Button(props, onClick)
	local color = props.BackgroundColor3 or C.blue
	local button = create("TextButton", {
		Name = props.Name or "Button",
		AnchorPoint = props.AnchorPoint,
		Position = props.Position,
		Size = props.Size,
		LayoutOrder = props.LayoutOrder,
		BackgroundColor3 = color,
		Text = "",
		AutoButtonColor = true,
		Visible = props.Visible ~= false,
		ZIndex = props.ZIndex,
		Parent = props.Parent,
	}, { Ui.Corner(props.Radius or 14), Ui.Outline(3), Ui.Shine() })
	local label = Ui.Text({
		Name = "Label",
		Size = UDim2.new(1, -12, 1, -8),
		Position = UDim2.fromOffset(6, 4),
		Text = props.Text or "",
		TextColor3 = props.TextColor3,
		ZIndex = props.ZIndex,
		Parent = button,
	})
	if onClick then
		button.Activated:Connect(onClick)
	end
	return button, label
end

-- 왼쪽/오른쪽 세로 줄에 들어가는 큰 아이콘 버튼 (아이콘 + 아래 이름)
function Ui.IconButton(props, onClick)
	local button = Ui.Button({
		Name = props.Name,
		Size = UDim2.fromOffset(78, 78),
		LayoutOrder = props.LayoutOrder,
		BackgroundColor3 = props.Color,
		Text = props.Icon,
		Parent = props.Parent,
		Radius = 18,
	}, onClick)
	button.Label.Size = UDim2.new(1, -16, 0.62, 0)
	button.Label.Position = UDim2.fromOffset(8, 4)
	local caption = Ui.Text({
		Name = "Caption",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 10),
		Size = UDim2.new(1, 14, 0, 26),
		Text = props.Caption,
		TextStroke = 3,
		Parent = button,
	})
	-- 오른쪽 위 작은 빨간 알림 배지
	local badge = Ui.Text({
		Name = "Badge",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(1, -4, 0, 4),
		Size = UDim2.fromOffset(30, 30),
		BackgroundTransparency = 0,
		BackgroundColor3 = C.red,
		Text = "!",
		Visible = false,
		ZIndex = 3,
		Parent = button,
	})
	Ui.Round().Parent = badge
	return button, caption, badge
end

function Ui.Panel(props, children)
	props.BackgroundColor3 = props.BackgroundColor3 or C.panel
	props.BackgroundTransparency = props.BackgroundTransparency or 0.1
	local frame = create("Frame", props, { Ui.Corner(16), Ui.Outline(3) })
	for _, child in ipairs(children or {}) do
		child.Parent = frame
	end
	return frame
end

-- 살짝 커졌다 돌아오는 효과
function Ui.Pop(guiObject, size)
	local scale = guiObject:FindFirstChild("PopScale") or create("UIScale", { Name = "PopScale", Parent = guiObject })
	scale.Scale = size or 1.2
	TweenService:Create(scale, TweenInfo.new(0.3, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

-- 가운데 뜨는 창 (제목줄, 닫기 버튼, 내용 영역)
function Ui.Window(parent, title, color, size)
	local window = Ui.Panel({
		Name = title,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.52),
		Size = size or UDim2.fromOffset(660, 450),
		BackgroundTransparency = 0,
		Visible = false,
		ZIndex = 20,
		Parent = parent,
	})
	local header = create("Frame", {
		Name = "Header",
		Size = UDim2.new(1, 0, 0, 60),
		BackgroundColor3 = color,
		ZIndex = 21,
		Parent = window,
	}, { Ui.Corner(16), Ui.Shine() })
	Ui.Text({
		Name = "Title",
		Position = UDim2.fromOffset(18, 8),
		Size = UDim2.new(0.6, 0, 1, -16),
		Text = title,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextStroke = 3,
		ZIndex = 22,
		Parent = header,
	})
	local close = Ui.Button({
		Name = "Close",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 12, 0, -12),
		Size = UDim2.fromOffset(52, 52),
		BackgroundColor3 = C.red,
		Text = "X",
		ZIndex = 23,
		Parent = window,
	})
	close.Activated:Connect(function()
		window.Visible = false
	end)
	local content = create("Frame", {
		Name = "Content",
		Position = UDim2.fromOffset(14, 72),
		Size = UDim2.new(1, -28, 1, -86),
		BackgroundTransparency = 1,
		ZIndex = 21,
		Parent = window,
	})
	return window, content, header
end

-- 카드가 격자로 늘어서는 스크롤 영역
function Ui.Grid(parent, cellSize, props)
	local scroll = create("ScrollingFrame", {
		Name = "Grid",
		Position = props and props.Position or UDim2.new(),
		Size = props and props.Size or UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		ZIndex = 21,
		Parent = parent,
	})
	create("UIGridLayout", {
		CellSize = cellSize,
		CellPadding = UDim2.fromOffset(10, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = scroll,
	})
	create("UIPadding", { PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6), Parent = scroll })
	return scroll
end

-- 창 안의 탭 버튼 줄
function Ui.Tabs(parent, names, onSelect)
	local bar = create("Frame", {
		Name = "Tabs",
		Size = UDim2.new(1, 0, 0, 46),
		BackgroundTransparency = 1,
		ZIndex = 21,
		Parent = parent,
	})
	create("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = bar,
	})
	local buttons = {}
	local function selectIndex(index)
		for i, button in ipairs(buttons) do
			button.BackgroundColor3 = i == index and C.gold or C.panelLight
		end
		onSelect(index)
	end
	for index, name in ipairs(names) do
		buttons[index] = Ui.Button({
			Name = "Tab" .. index,
			Size = UDim2.fromOffset(150, 44),
			LayoutOrder = index,
			BackgroundColor3 = C.panelLight,
			Text = name,
			ZIndex = 22,
			Parent = bar,
		}, function()
			selectIndex(index)
		end)
	end
	return bar, selectIndex
end

return Ui
