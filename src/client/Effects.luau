--[[
	연출: 볼 날아가기, 숫자 팝업, 타격 이펙트, 화면 흔들림, 효과음
	모두 내 화면에서만 만들어지는 것이라 서버 부하가 없습니다.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local player = Players.LocalPlayer

local Effects = {}

local MAX_BALLS = 50

local fxFolder = Instance.new("Folder")
fxFolder.Name = "ClientEffects"
fxFolder.Parent = workspace

local activeBalls = 0

local ballTemplate = Instance.new("Part")
ballTemplate.Name = "Ball"
ballTemplate.Shape = Enum.PartType.Ball
ballTemplate.Size = Vector3.new(1.6, 1.6, 1.6)
ballTemplate.Color = Color3.fromRGB(255, 130, 190)
ballTemplate.Material = Enum.Material.Neon
ballTemplate.Anchored = true
ballTemplate.CanCollide = false
ballTemplate.CanTouch = false
ballTemplate.CanQuery = false
ballTemplate.CastShadow = false

-- 효과음 (Roblox 기본 내장 소리)
local function makeSound(id, volume)
	local sound = Instance.new("Sound")
	sound.SoundId = id
	sound.Volume = volume
	sound.Parent = fxFolder
	return sound
end

local sounds = {
	throw = makeSound("rbxasset://sounds/swoosh.wav", 0.35),
	hit = makeSound("rbxasset://sounds/electronicpingshort.wav", 0.25),
	levelUp = makeSound("rbxasset://sounds/electronicpingshort.wav", 0.6),
	death = makeSound("rbxasset://sounds/uuhhh.mp3", 0.7),
	click = makeSound("rbxasset://sounds/button.wav", 0.5),
}

-- 연속으로 던질수록 효과음이 높아집니다
local combo = 0
local lastComboTime = 0

function Effects.PlayThrow()
	local now = os.clock()
	if now - lastComboTime > 1.2 then
		combo = 0
	end
	combo += 1
	lastComboTime = now
	sounds.throw.PlaybackSpeed = 0.9 + math.min(0.9, combo * 0.015)
	sounds.throw:Play()
end

function Effects.PlayHit()
	sounds.hit.PlaybackSpeed = 1.4 + math.random() * 0.2
	sounds.hit:Play()
end

function Effects.PlayLevelUp()
	sounds.levelUp.PlaybackSpeed = 2
	sounds.levelUp:Play()
end

function Effects.PlayDeath()
	sounds.death:Play()
end

function Effects.PlayClick()
	sounds.click:Play()
end

-- 포물선을 그리며 날아가는 볼
function Effects.Throw(from, to, onArrive)
	if activeBalls >= MAX_BALLS then
		if onArrive then
			onArrive()
		end
		return
	end
	activeBalls += 1

	local ball = ballTemplate:Clone()
	ball.Position = from
	ball.Parent = fxFolder

	local distance = (to - from).Magnitude
	local duration = math.clamp(distance / 140, 0.08, 0.35)
	local arc = math.min(6, distance * 0.15)
	local startTime = os.clock()

	local connection
	connection = RunService.RenderStepped:Connect(function()
		local alpha = math.min(1, (os.clock() - startTime) / duration)
		local position = from:Lerp(to, alpha) + Vector3.new(0, math.sin(alpha * math.pi) * arc, 0)
		ball.CFrame = CFrame.new(position) * CFrame.Angles(alpha * 12, 0, 0)
		if alpha >= 1 then
			connection:Disconnect()
			ball:Destroy()
			activeBalls -= 1
			if onArrive then
				onArrive()
			end
		end
	end)
end

-- 맞은 자리에 퍼지는 동그라미
function Effects.Burst(position, color)
	local burst = ballTemplate:Clone()
	burst.Size = Vector3.new(1, 1, 1)
	burst.Color = color or Color3.fromRGB(255, 240, 150)
	burst.Position = position
	burst.Transparency = 0.2
	burst.Parent = fxFolder
	TweenService:Create(burst, TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(5, 5, 5),
		Transparency = 1,
	}):Play()
	Debris:AddItem(burst, 0.3)
end

-- 위로 떠오르며 사라지는 숫자
function Effects.Popup(position, text, color, scale)
	scale = scale or 1
	local anchor = Instance.new("Part")
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanTouch = false
	anchor.CanQuery = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(0.2, 0.2, 0.2)
	anchor.Position = position + Vector3.new(math.random() * 2 - 1, 1, math.random() * 2 - 1)
	anchor.Parent = fxFolder

	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(120 * scale, 44 * scale)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.Parent = anchor

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = text
	label.TextColor3 = color or Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0
	label.Parent = gui

	local info = TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(gui, info, { StudsOffset = Vector3.new(0, 4, 0) }):Play()
	TweenService:Create(label, info, { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(anchor, 0.75)
end

-- 화면 흔들림
local shake = 0

function Effects.Shake(amount)
	shake = math.max(shake, amount)
end

RunService.RenderStepped:Connect(function()
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	if shake > 0.01 then
		humanoid.CameraOffset = Vector3.new(
			(math.random() * 2 - 1) * shake,
			(math.random() * 2 - 1) * shake,
			0
		)
		shake *= 0.82
	elseif humanoid.CameraOffset ~= Vector3.zero then
		shake = 0
		humanoid.CameraOffset = Vector3.zero
	end
end)

return Effects
