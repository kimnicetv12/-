--[[
	게임패스 확인과 구매 창 띄우기
	Config.GamePasses의 id가 0이면 아직 만들지 않은 것으로 보고 "준비 중"이라고 알려줍니다.
]]

local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local Passes = {}

local owned = {} -- [player] = { [key] = true }
local changedCallback

local function keyForId(id)
	for key, info in pairs(Config.GamePasses) do
		if info.id == id and id ~= 0 then
			return key
		end
	end
	return nil
end

function Passes.Load(player)
	local result = {}
	local studioFree = Config.StudioOwnsAllPasses and RunService:IsStudio()
	for key, info in pairs(Config.GamePasses) do
		if studioFree then
			result[key] = true
		elseif info.id ~= 0 then
			local ok, has = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, info.id)
			end)
			if ok and has then
				result[key] = true
			end
		end
	end
	owned[player] = result
	return result
end

function Passes.Get(player)
	return owned[player] or {}
end

function Passes.Owns(player, key)
	return key ~= nil and (owned[player] or {})[key] == true
end

-- 구매 창을 띄웁니다. 성공하면 false, 이유 문자열을 돌려줍니다
function Passes.Prompt(player, key)
	local info = Config.GamePasses[key]
	if not info then
		return false, "없는 상품이에요"
	end
	if Passes.Owns(player, key) then
		return false, "이미 가지고 있어요"
	end
	if info.id == 0 then
		return false, "'" .. info.name .. "' 게임패스는 아직 준비 중이에요 (Config.GamePasses에 id를 넣어주세요)"
	end
	MarketplaceService:PromptGamePassPurchase(player, info.id)
	return true
end

function Passes.OnChanged(callback)
	changedCallback = callback
end

function Passes.Release(player)
	owned[player] = nil
end

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
	if not purchased then
		return
	end
	local key = keyForId(passId)
	if key and owned[player] then
		owned[player][key] = true
		if changedCallback then
			changedCallback(player, key)
		end
	end
end)

return Passes
