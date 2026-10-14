--[[
	내 정보 읽기 (서버가 플레이어 속성으로 보내주는 값)
]]

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local player = Players.LocalPlayer

local State = {}

local DEFAULTS = { Pad = 1, Level = 1, Skin = "basic", Aura = "" }

function State.Get(name)
	local value = player:GetAttribute(name)
	if value == nil then
		return DEFAULTS[name] or 0
	end
	return value
end

local jsonCache = {}

-- 표 값 (Skins, Auras, BestStages, Passes)
function State.Json(name)
	local raw = player:GetAttribute(name .. "Json")
	if raw == nil then
		return {}
	end
	local cached = jsonCache[name]
	if cached and cached.raw == raw then
		return cached.value
	end
	local ok, value = pcall(function()
		return HttpService:JSONDecode(raw)
	end)
	value = ok and type(value) == "table" and value or {}
	jsonCache[name] = { raw = raw, value = value }
	return value
end

function State.OwnsPass(key)
	return key ~= nil and State.Json("Passes")[key] == true
end

function State.OwnsSkin(skin)
	return skin.id == "basic" or State.Json("Skins")[skin.id] == true or State.OwnsPass(skin.pass)
end

function State.OwnsAura(aura)
	return State.Json("Auras")[aura.id] == true
end

function State.BestStage(world)
	return tonumber(State.Json("BestStages")[world]) or 0
end

function State.EventMultiplier()
	if (workspace:GetAttribute("EventEnds") or 0) > os.time() then
		return workspace:GetAttribute("EventMult") or 1
	end
	return 1
end

function State.Context()
	return {
		pad = State.Get("Pad"),
		rebirths = State.Get("Rebirths"),
		skin = State.Get("Skin"),
		aura = State.Get("Aura"),
		doubleSpeed = State.OwnsPass("DoubleSpeed"),
		eventMult = State.EventMultiplier(),
	}
end

function State.Gain()
	return Config.GainPerThrow(State.Context())
end

function State.CanAutoThrow()
	return Config.FreeAutoThrow or State.OwnsPass("AutoThrow")
end

-- 값이 바뀔 때마다 부릅니다
function State.OnChanged(callback)
	player.AttributeChanged:Connect(callback)
	workspace:GetAttributeChangedSignal("EventMult"):Connect(callback)
	workspace:GetAttributeChangedSignal("EventEnds"):Connect(callback)
end

return State
