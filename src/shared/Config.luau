--[[
	게임 밸런스 설정 (서버와 클라이언트가 함께 씁니다)
	숫자를 바꾸고 다시 플레이(F5)하면 바로 적용됩니다.
]]

local Config = {}

Config.GameName = "왁뿌볼 던지기"
Config.BallName = "왁뿌볼"

-- 게임패스 --------------------------------------------------------------------
-- 크리에이터 대시보드에서 게임패스를 만든 뒤 id에 번호를 넣으세요. 0이면 "준비 중"으로 표시됩니다.
-- StudioOwnsAllPasses = true로 바꾸면 스튜디오 테스트에서만 모든 게임패스를 가진 것으로 취급합니다.
Config.StudioOwnsAllPasses = false

Config.GamePasses = {
	DoubleSpeed = { id = 0, name = "2배 속도", icon = "⚡", robux = 99, desc = "던질 때 얻는 속도 2배" },
	AutoThrow = { id = 0, name = "자동 던지기", icon = "🤖", robux = 249, desc = "버튼 하나로 계속 던지기" },
	DoubleTrophies = { id = 0, name = "2배 트로피", icon = "🏆", robux = 95, desc = "귀환할 때 받는 트로피 2배" },
	DeathInsurance = { id = 0, name = "사망 보험", icon = "🛡️", robux = 149, desc = "죽어도 미수령 트로피 30% 보존" },
	GoldDummy = { id = 0, name = "황금 허수아비", icon = "🥇", robux = 79, desc = "허수아비 훈련 x3" },
	DiamondDummy = { id = 0, name = "다이아 허수아비", icon = "💎", robux = 345, desc = "허수아비 훈련 x9" },
	CandyDummy = { id = 0, name = "캔디 허수아비", icon = "🍭", robux = 749, desc = "허수아비 훈련 x25" },
	AdminDummy = { id = 0, name = "운영자 허수아비", icon = "👑", robux = 1199, desc = "허수아비 훈련 x100" },
	GalaxyBall = { id = 0, name = "은하 왁뿌볼", icon = "🌌", robux = 295, desc = "속도 x10 스킨" },
	ChocoBall = { id = 0, name = "초코 왁뿌볼", icon = "🍫", robux = 499, desc = "속도 x20 스킨" },
	AdminBall = { id = 0, name = "운영자 왁뿌볼", icon = "👑", robux = 1799, desc = "속도 x100 스킨" },
}

-- 상점에 보여줄 게임패스 순서
Config.PassOrder = {
	"DoubleSpeed",
	"AutoThrow",
	"DoubleTrophies",
	"DeathInsurance",
	"GoldDummy",
	"DiamondDummy",
	"CandyDummy",
	"AdminDummy",
}

Config.FreeAutoThrow = true -- false면 자동 던지기는 게임패스가 있어야 씁니다
Config.DeathInsuranceKeep = 0.3

-- 던지기 -----------------------------------------------------------------------

Config.ThrowRange = 55
Config.MaxThrowsPerSecond = 10

function Config.ThrowsPerSecond(speed)
	return math.min(Config.MaxThrowsPerSecond, 3 + 1.2 * math.log(1 + speed / 100, 2))
end

function Config.Damage(speed)
	return 1 + math.floor(speed / 20)
end

-- 던지기 파워 발판 (로비의 숫자 발판). 밟으면 트로피로 구매, 던질 때 얻는 기본 속도가 됩니다.
Config.Pads = {
	{ value = 1, cost = 0 },
	{ value = 2, cost = 3 },
	{ value = 3, cost = 15 },
	{ value = 5, cost = 60 },
	{ value = 10, cost = 250 },
	{ value = 25, cost = 1000 },
	{ value = 50, cost = 4000 },
	{ value = 100, cost = 15000 },
	{ value = 250, cost = 60000 },
	{ value = 500, cost = 200000 },
}

-- 왁뿌볼 스킨 (원작의 트레일). 하나만 장착, 속도 배수
Config.Skins = {
	{ id = "basic", name = "기본 왁뿌볼", rarity = 1, mult = 1, cost = 0, color = Color3.fromRGB(255, 130, 190) },
	{ id = "green", name = "초록 왁뿌볼", rarity = 1, mult = 1.5, cost = 100, color = Color3.fromRGB(90, 220, 110) },
	{ id = "sky", name = "하늘 왁뿌볼", rarity = 1, mult = 2, cost = 400, color = Color3.fromRGB(90, 180, 255) },
	{ id = "purple", name = "보라 왁뿌볼", rarity = 2, mult = 3, cost = 1500, color = Color3.fromRGB(170, 90, 255) },
	{ id = "fire", name = "불꽃 왁뿌볼", rarity = 2, mult = 4, cost = 6000, color = Color3.fromRGB(255, 90, 50) },
	{ id = "rainbow", name = "무지개 왁뿌볼", rarity = 3, mult = 5, cost = 25000, color = Color3.fromRGB(255, 255, 255), rainbow = true },
	{ id = "gold", name = "황금 왁뿌볼", rarity = 3, mult = 8, cost = 150000, color = Color3.fromRGB(255, 205, 60) },
	{ id = "galaxy", name = "은하 왁뿌볼", rarity = 4, mult = 10, pass = "GalaxyBall", color = Color3.fromRGB(60, 40, 140) },
	{ id = "choco", name = "초코 왁뿌볼", rarity = 4, mult = 20, pass = "ChocoBall", color = Color3.fromRGB(120, 70, 40) },
	{ id = "admin", name = "운영자 왁뿌볼", rarity = 5, mult = 100, pass = "AdminBall", color = Color3.fromRGB(255, 40, 40), rainbow = true },
	-- 월드 보스를 처음 잡으면 받는 전용 스킨
	{ id = "crown1", name = "초원 왕관볼", rarity = 4, mult = 6, boss = 1, color = Color3.fromRGB(150, 255, 120) },
	{ id = "crown2", name = "사탕 왕관볼", rarity = 4, mult = 15, boss = 2, color = Color3.fromRGB(255, 150, 220) },
	{ id = "crown3", name = "별빛 왕관볼", rarity = 5, mult = 40, boss = 3, color = Color3.fromRGB(140, 220, 255) },
}

-- 오라. 스킨 배수 위에 곱해집니다
Config.Auras = {
	{ id = "sparkle", name = "반짝 오라", rarity = 2, mult = 1.2, cost = 20000, color = Color3.fromRGB(255, 255, 200) },
	{ id = "water", name = "물결 오라", rarity = 3, mult = 2, cost = 150000, color = Color3.fromRGB(80, 170, 255) },
	{ id = "flame", name = "화염 오라", rarity = 4, mult = 3, cost = 800000, color = Color3.fromRGB(255, 110, 40) },
	{ id = "thunder", name = "번개 오라", rarity = 5, mult = 5, cost = 5000000, color = Color3.fromRGB(255, 240, 80) },
}

Config.Rarities = {
	{ name = "일반", color = Color3.fromRGB(180, 180, 190) },
	{ name = "희귀", color = Color3.fromRGB(80, 170, 255) },
	{ name = "영웅", color = Color3.fromRGB(190, 90, 255) },
	{ name = "전설", color = Color3.fromRGB(255, 180, 40) },
	{ name = "신화", color = Color3.fromRGB(255, 70, 90) },
}

-- 훈련 허수아비 (원작의 트레드밀). 노란 원 안에 서 있으면 자동으로 던집니다
Config.Dummies = {
	{ name = "나무 허수아비", mult = 1, color = Color3.fromRGB(200, 160, 110) },
	{ name = "황금 허수아비", mult = 3, pass = "GoldDummy", color = Color3.fromRGB(255, 205, 60) },
	{ name = "다이아 허수아비", mult = 9, pass = "DiamondDummy", color = Color3.fromRGB(120, 230, 255) },
	{ name = "캔디 허수아비", mult = 25, pass = "CandyDummy", color = Color3.fromRGB(255, 140, 210) },
	{ name = "운영자 허수아비", mult = 100, pass = "AdminDummy", color = Color3.fromRGB(255, 70, 70) },
}
Config.DummyRange = 8
Config.DummyThrowsPerSecond = 2

function Config.FindById(list, id)
	for _, item in ipairs(list) do
		if item.id == id then
			return item
		end
	end
	return nil
end

-- 던질 때 얻는 속도 = 발판 파워 × 환생 × 스킨 × 오라 × 2배 패스 × 운영자 이벤트
-- ctx = { pad, rebirths, skin, aura, doubleSpeed, eventMult }
function Config.SpeedMultiplier(ctx)
	local skin = Config.FindById(Config.Skins, ctx.skin)
	local aura = Config.FindById(Config.Auras, ctx.aura)
	return Config.RebirthMultiplier(ctx.rebirths)
		* (skin and skin.mult or 1)
		* (aura and aura.mult or 1)
		* (ctx.doubleSpeed and 2 or 1)
		* (ctx.eventMult or 1)
end

function Config.GainPerThrow(ctx)
	local pad = Config.Pads[ctx.pad] or Config.Pads[1]
	return pad.value * Config.SpeedMultiplier(ctx)
end

-- 레벨 ------------------------------------------------------------------------

function Config.SpeedForLevel(level)
	if level <= 1 then
		return 0
	end
	return math.floor(10 * (level - 1) ^ 2.5)
end

function Config.LevelFromSpeed(speed)
	if speed <= 0 then
		return 1
	end
	local level = math.max(1, math.floor((speed / 10) ^ (1 / 2.5)) + 1)
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
	return math.min(32, 16 + level * 0.1)
end

-- 환생 ------------------------------------------------------------------------
-- n번째 환생에 필요한 레벨과, n번 환생했을 때의 속도 배수

local REBIRTH_LEVELS = { 15, 25, 40, 55, 75, 100, 130, 160, 200, 250, 300, 380, 460, 540, 600 }
local REBIRTH_MULTS = { 1.5, 2, 2.5, 3, 3.5, 5, 6.5, 8, 10, 15, 25, 50, 100, 250, 500 }

function Config.RebirthLevel(rebirths)
	local nextRebirth = rebirths + 1
	if REBIRTH_LEVELS[nextRebirth] then
		return REBIRTH_LEVELS[nextRebirth]
	end
	return REBIRTH_LEVELS[#REBIRTH_LEVELS] + (nextRebirth - #REBIRTH_LEVELS) * 80
end

function Config.RebirthMultiplier(rebirths)
	if rebirths <= 0 then
		return 1
	end
	if REBIRTH_MULTS[rebirths] then
		return REBIRTH_MULTS[rebirths]
	end
	return REBIRTH_MULTS[#REBIRTH_MULTS] * 2 ^ (rebirths - #REBIRTH_MULTS)
end

-- 월드와 스테이지 ---------------------------------------------------------------

Config.StagesPerWorld = 13
Config.TargetStageSeconds = 15 -- 권장 레벨이면 한 스테이지 적을 이 시간 안에 처치

Config.Worlds = {
	{
		name = "말랑 초원",
		level = 1,
		recommended = { 1, 100 }, -- 1스테이지, 마지막 스테이지 권장 레벨
		rewardMult = 1,
		keyColors = { Color3.fromRGB(245, 245, 250), Color3.fromRGB(205, 235, 200) },
		dangerColor = Color3.fromRGB(255, 160, 140),
		enemyNames = { "말랑이", "재빠름이", "단단이" },
		bossName = "왕말랑이",
		bossColor = Color3.fromRGB(90, 200, 90),
	},
	{
		name = "사탕 왕국",
		level = 120,
		recommended = { 120, 380 },
		rewardMult = 500,
		keyColors = { Color3.fromRGB(255, 225, 240), Color3.fromRGB(200, 150, 110) },
		dangerColor = Color3.fromRGB(255, 90, 160),
		enemyNames = { "젤리곰", "솜사탕", "초코벽돌" },
		bossName = "거대 곰젤리",
		bossColor = Color3.fromRGB(255, 120, 190),
	},
	{
		name = "별빛 우주",
		level = 400,
		recommended = { 400, 840 },
		rewardMult = 250000,
		keyColors = { Color3.fromRGB(60, 60, 90), Color3.fromRGB(110, 90, 170) },
		dangerColor = Color3.fromRGB(150, 90, 255),
		enemyNames = { "별똥이", "유성", "블랙홀" },
		bossName = "은하 대왕",
		bossColor = Color3.fromRGB(120, 90, 255),
	},
}

function Config.RecommendedLevel(world, stage)
	local range = Config.Worlds[world].recommended
	local t = (stage - 1) / math.max(1, Config.StagesPerWorld - 1)
	return math.max(1, math.floor(range[1] * (range[2] / range[1]) ^ t + 0.5))
end

function Config.StageReward(world, stage)
	return math.ceil(3 * 1.9 ^ (stage - 1) * Config.Worlds[world].rewardMult)
end

-- 이 스테이지로 바로 텔레포트하는 비용 (트로피)
function Config.TeleportCost(world, stage)
	if stage <= 1 then
		return 0
	end
	return math.ceil(Config.StageReward(world, stage - 1) * 1.5)
end

function Config.EnemyCount(_world, stage)
	return 3 + math.floor((stage - 1) * 0.6)
end

-- 적 체력은 "권장 레벨의 공격력으로 TargetStageSeconds 안에 전멸"이 되도록 계산합니다
function Config.EnemyHealth(world, stage)
	local speed = Config.SpeedForLevel(Config.RecommendedLevel(world, stage))
	local dps = Config.Damage(speed) * Config.ThrowsPerSecond(speed)
	local total = dps * Config.TargetStageSeconds
	return math.max(3, math.floor(total / (Config.EnemyCount(world, stage) * 1.3)))
end

function Config.EnemyDamage(world, stage)
	return math.ceil(Config.MaxHealth(Config.RecommendedLevel(world, stage)) * 0.12)
end

function Config.PathLength(stage)
	return math.min(320, 140 + stage * 12)
end

function Config.PathWidth(stage)
	return math.max(12, 32 - stage * 1.6)
end

-- 깊은 스테이지일수록 키보드 사이 구멍(점프 구간)이 늘어납니다
function Config.GapCount(stage)
	return math.floor(stage / 3)
end

Config.EnemyAggroRange = 70
Config.EnemyAttackCooldown = 1

-- 적 종류 (이름은 월드마다 다름: Config.Worlds[n].enemyNames)
Config.EnemyTypes = {
	{ id = "Slime", minStage = 1, weight = 5, health = 1, speed = 7, damage = 1, size = 4, shape = "Ball", color = Color3.fromRGB(120, 220, 120) },
	{ id = "Runner", minStage = 3, weight = 3, health = 0.6, speed = 15, damage = 0.7, size = 3, shape = "Ball", color = Color3.fromRGB(255, 210, 70) },
	{ id = "Brute", minStage = 5, weight = 2, health = 3, speed = 4.5, damage = 2, size = 7, shape = "Block", color = Color3.fromRGB(230, 90, 90) },
}

Config.Boss = { health = 12, damage = 2, speed = 5, size = 13 }

-- 무료 보상 ---------------------------------------------------------------------

Config.GiftCooldown = 4 * 60 * 60 -- 무료 선물 상자 (4시간마다)
Config.GiftThrows = 400 -- 선물 = 지금 던지기 400번 분량의 속도

-- 코드 (대문자로 적으세요)
Config.Codes = {
	WAKPPU = { speed = 1000, text = "속도 +1,000" },
	RELEASE = { trophies = 50, text = "트로피 +50" },
}

-- 운영자 이벤트: 채팅에 /event 10 30 (속도 10배, 30분) · /event off
Config.Admins = {} -- 운영자 UserId 목록 (게임 주인과 스튜디오는 자동으로 운영자)

return Config
