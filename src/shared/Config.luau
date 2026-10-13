--[[
	게임 밸런스 설정
	숫자를 바꾸고 다시 플레이(F5)하면 바로 적용됩니다.
	서버와 클라이언트가 같은 공식을 쓰도록 ReplicatedStorage에 둡니다.
]]

local Config = {}

Config.GameName = "왁뿌볼 던지기"
Config.BallName = "왁뿌볼"
Config.WorldName = "월드 1 · 말랑 초원"
Config.StagesPerWorld = 10

-- 던지기 -----------------------------------------------------------------

Config.BaseGain = 1 -- 던질 때마다 오르는 기본 속도
Config.FreeAutoThrow = true -- false로 바꾸면 자동 던지기 버튼이 사라집니다 (나중에 게임패스로 팔 때)
Config.ThrowRange = 55 -- 이 거리 안의 가장 가까운 적에게 던집니다
Config.MaxThrowsPerSecond = 10 -- 공속 상한 (서버 부하 방지)

-- 공속: 처음엔 빠르게 오르고 뒤로 갈수록 완만해집니다 (소프트캡)
function Config.ThrowsPerSecond(speed)
	return math.min(Config.MaxThrowsPerSecond, 3 + 1.5 * math.log(1 + speed / 50, 2))
end

-- 공격력: 속도가 오를수록 강해집니다
function Config.Damage(speed)
	return 1 + math.floor(speed / 20)
end

-- 던질 때 얻는 속도 = (기본값 + 볼 강화) × 환생 배수
function Config.GainPerThrow(data)
	return (Config.BaseGain + data.BallUpgrade) * Config.RebirthMultiplier(data.Rebirths)
end

-- 레벨 -------------------------------------------------------------------

-- 레벨 L이 되려면 필요한 속도
function Config.SpeedForLevel(level)
	if level <= 1 then
		return 0
	end
	return math.floor(15 * (level - 1) ^ 1.6)
end

function Config.LevelFromSpeed(speed)
	if speed <= 0 then
		return 1
	end
	local level = math.max(1, math.floor((speed / 15) ^ (1 / 1.6)) + 1)
	while level > 1 and Config.SpeedForLevel(level) > speed do
		level -= 1
	end
	while Config.SpeedForLevel(level + 1) <= speed do
		level += 1
	end
	return level
end

function Config.MaxHealth(level)
	return 100 + (level - 1) * 10
end

function Config.WalkSpeed(level)
	return math.min(30, 16 + level * 0.5)
end

-- 볼 강화 (트로피로 구매) -------------------------------------------------

function Config.UpgradeCost(upgradeLevel)
	return math.floor(10 * 1.6 ^ upgradeLevel)
end

-- 환생 -------------------------------------------------------------------

function Config.RebirthLevel(rebirths)
	return 15 + rebirths * 10
end

function Config.RebirthMultiplier(rebirths)
	return 1 + rebirths
end

-- 훈련 허수아비 ------------------------------------------------------------

Config.DummyRange = 12 -- 이 거리 안에 서 있으면 자동으로 던집니다
Config.DummyThrowsPerSecond = 1.5
Config.DummyMultiplier = 1 -- 상위 단계(유료)는 이 배수를 올리면 됩니다

-- 스테이지 ----------------------------------------------------------------

function Config.StageReward(stage)
	return math.ceil(3 * stage ^ 1.5)
end

function Config.EnemyCount(stage)
	return 3 + math.floor((stage - 1) * 0.7)
end

function Config.EnemyHealth(stage)
	return math.floor(6 * 1.6 ^ (stage - 1))
end

function Config.EnemyDamage(stage)
	return 10 + (stage - 1) * 4
end

function Config.PathLength(stage)
	return math.min(400, 150 + stage * 12)
end

-- 깊이 갈수록 길이 좁아집니다
function Config.PathWidth(stage)
	return math.max(12, 34 - stage * 2)
end

Config.EnemyAggroRange = 70 -- 이 거리 안에 들어오면 쫓아옵니다
Config.EnemyAttackCooldown = 1 -- 초

Config.EnemyTypes = {
	{
		id = "Slime",
		name = "말랑이",
		minStage = 1,
		weight = 5,
		health = 1,
		speed = 7,
		damage = 1,
		size = 4,
		shape = "Ball",
		color = Color3.fromRGB(120, 220, 120),
	},
	{
		id = "Runner",
		name = "재빠름이",
		minStage = 3,
		weight = 3,
		health = 0.6,
		speed = 15,
		damage = 0.7,
		size = 3,
		shape = "Ball",
		color = Color3.fromRGB(255, 210, 70),
	},
	{
		id = "Brute",
		name = "단단이",
		minStage = 5,
		weight = 2,
		health = 3,
		speed = 4.5,
		damage = 2,
		size = 7,
		shape = "Block",
		color = Color3.fromRGB(230, 90, 90),
	},
}

-- 권장 레벨: 평균 스펙으로 한 스테이지를 이 시간 안에 깰 수 있는 레벨
Config.TargetStageSeconds = 30

local recommendedCache = {}

function Config.RecommendedLevel(stage)
	if recommendedCache[stage] then
		return recommendedCache[stage]
	end
	local totalHealth = Config.EnemyCount(stage) * Config.EnemyHealth(stage) * 1.5
	local function fastEnough(speed)
		return totalHealth / (Config.Damage(speed) * Config.ThrowsPerSecond(speed)) <= Config.TargetStageSeconds
	end
	local low, high = 0, 1
	while not fastEnough(high) and high < 1e15 do
		high *= 2
	end
	for _ = 1, 60 do
		local mid = (low + high) / 2
		if fastEnough(mid) then
			high = mid
		else
			low = mid
		end
	end
	local level = Config.LevelFromSpeed(high)
	recommendedCache[stage] = level
	return level
end

return Config
