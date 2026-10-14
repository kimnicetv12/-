--[[
	저장 (DataStore)
	스튜디오에서 저장까지 테스트하려면: 게임을 Roblox에 게시한 뒤
	홈 → 게임 설정 → 보안 → "Studio에서 API 서비스 사용"을 켜세요.
	꺼져 있어도 게임은 그대로 돌아가고, 저장만 건너뜁니다.
]]

local DataStoreService = game:GetService("DataStoreService")

local Data = {}

-- 저장되는 값과 기본값 (미수령 트로피는 저장하지 않습니다)
local DEFAULTS = {
	Speed = 0,
	Trophies = 0,
	Pad = 1, -- 구매한 가장 높은 던지기 파워 발판 번호
	Rebirths = 0,
	BestStages = { 0, 0, 0 }, -- 월드별 최고 클리어 스테이지
	Skins = { basic = true },
	Skin = "basic",
	Auras = {},
	Aura = "",
	Codes = {},
	LastGift = 0,
}

local STORE_NAME = "WakppuBall_v2"

local store, topStore
do
	local ok, err = pcall(function()
		store = DataStoreService:GetDataStore(STORE_NAME)
		topStore = DataStoreService:GetOrderedDataStore("TopSpeed_v2")
	end)
	if not ok then
		store, topStore = nil, nil
		warn("[저장] DataStore를 쓸 수 없어서 이번 세션은 저장하지 않아요: " .. tostring(err))
	end
end

Data.TopStore = topStore

local canSave = {}

local function keyFor(player)
	return "player_" .. player.UserId
end

local function deepCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local copy = {}
	for k, v in pairs(value) do
		copy[k] = deepCopy(v)
	end
	return copy
end

function Data.Defaults()
	return deepCopy(DEFAULTS)
end

function Data.Load(player)
	local data = deepCopy(DEFAULTS)
	if not store then
		return data
	end

	local ok, saved
	for attempt = 1, 3 do
		ok, saved = pcall(function()
			return store:GetAsync(keyFor(player))
		end)
		if ok then
			break
		end
		if attempt < 3 then
			task.wait(1)
		end
	end

	if not ok then
		warn("[저장] " .. player.Name .. " 데이터를 불러오지 못해서 이번 세션은 저장하지 않아요: " .. tostring(saved))
		return data
	end

	if type(saved) == "table" then
		for key, default in pairs(DEFAULTS) do
			if type(saved[key]) == type(default) then
				data[key] = saved[key]
			end
		end
		-- 월드가 늘어나도 칸이 모자라지 않게
		for i = 1, #DEFAULTS.BestStages do
			data.BestStages[i] = tonumber(data.BestStages[i]) or 0
		end
		data.Skins.basic = true
	end
	canSave[player] = true
	return data
end

function Data.Save(player, data)
	if not store or not canSave[player] then
		return
	end
	local payload = {}
	for key in pairs(DEFAULTS) do
		payload[key] = data[key]
	end
	local ok, err = pcall(function()
		store:SetAsync(keyFor(player), payload)
	end)
	if not ok then
		warn("[저장] " .. player.Name .. " 저장 실패: " .. tostring(err))
	end
	if topStore then
		pcall(function()
			topStore:SetAsync(tostring(player.UserId), math.floor(math.min(data.Speed, 2 ^ 52)))
		end)
	end
end

function Data.Release(player)
	canSave[player] = nil
end

return Data
