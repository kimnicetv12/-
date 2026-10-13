--[[
	저장 (DataStore)
	스튜디오에서 저장까지 테스트하려면: 게임을 Roblox에 게시한 뒤
	홈 → 게임 설정 → 보안 → "Studio에서 API 서비스 사용"을 켜세요.
	꺼져 있어도 게임은 그대로 돌아가고, 저장만 건너뜁니다.
]]

local DataStoreService = game:GetService("DataStoreService")

local Data = {}

-- 저장되는 값들 (미수령 트로피는 저장하지 않습니다: 나가면 사라짐)
Data.Keys = { "Speed", "Trophies", "BallUpgrade", "Rebirths", "BestStage" }

local DEFAULTS = {
	Speed = 0,
	Trophies = 0,
	BallUpgrade = 0,
	Rebirths = 0,
	BestStage = 0,
}

local STORE_NAME = "WakppuBall_v1"

local store
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then
		store = result
	else
		warn("[저장] DataStore를 쓸 수 없어서 이번 세션은 저장하지 않아요: " .. tostring(result))
	end
end

-- 불러오기에 실패한 플레이어는 저장도 막아서, 기존 데이터를 빈 값으로 덮어쓰지 않게 합니다
local canSave = {}

local function keyFor(player)
	return "player_" .. player.UserId
end

function Data.Load(player)
	local data = table.clone(DEFAULTS)
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
		for _, key in ipairs(Data.Keys) do
			if type(saved[key]) == "number" then
				data[key] = saved[key]
			end
		end
	end
	canSave[player] = true
	return data
end

function Data.Save(player, data)
	if not store or not canSave[player] then
		return
	end
	local payload = {}
	for _, key in ipairs(Data.Keys) do
		payload[key] = data[key]
	end
	local ok, err = pcall(function()
		store:SetAsync(keyFor(player), payload)
	end)
	if not ok then
		warn("[저장] " .. player.Name .. " 저장 실패: " .. tostring(err))
	end
end

function Data.Release(player)
	canSave[player] = nil
end

return Data
