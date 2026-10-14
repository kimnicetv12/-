-- End-to-end play-through of the real game scripts inside the fake engine.
-- Run from the repo root:  tools/luaurun/target/release/luaurun --run tests/playtest.luau
__ROOT = "."
local M = __load(__readfile("tests/mockroblox.luau"), "mockroblox", _G)()
M.datastoreDisabled = __NO_DATASTORE == true

local passed, failed = 0, 0
local function check(cond, msg)
	if cond then
		passed += 1
	else
		failed += 1
		print("  FAIL: " .. msg)
	end
end
local function section(name) print("== " .. name) end

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")

M.mountFolder(RS, "Shared", "src/shared", { "Config.luau", "Format.luau" })
local _, serverScripts = M.mountFolder(SSS, "Server", "src/server", { "Main.server.luau", "World.luau", "Data.luau", "Passes.luau" })
local Config = require(RS.Shared.Config)

-- server boots
M.runSource(serverScripts[1], __ROOT .. "/src/server/Main.server.luau", false)
M.advance(0.5)
check(workspace:FindFirstChild("Lobby") ~= nil, "lobby built")
local lobby = workspace.Lobby
local Remotes = RS.Remotes

-- player joins (client scripts live in PlayerScripts)
local player = M.makePlayer("Tester", 777)
rawget(Players, "_props").LocalPlayer = player
M.remoteHub.localPlayer = player
local playerScripts = M.newInstance("PlayerScripts")
playerScripts.Name = "PlayerScripts"
playerScripts.Parent = player
local _, clientScripts = M.mountFolder(playerScripts, "Client", "src/client", { "Main.client.luau", "Effects.luau", "Ui.luau", "State.luau", "Menus.luau" })

Players.PlayerAdded:Fire(player)
M.advance(0.2)
local character = M.makeCharacter(player)
M.advance(0.2)
M.runSource(clientScripts[1], __ROOT .. "/src/client/Main.client.luau", false)
M.advance(0.5)

local function attr(name) return player:GetAttribute(name) end
local function root() return player.Character.HumanoidRootPart end
local function humanoid() return player.Character.Humanoid end
local function moveTo(position) root().CFrame = CFrame.new(position) end
local function throw(count)
	for _ = 1, count do
		Remotes.Throw:FireServer()
		M.advance(0.34, 0.34)
	end
end
local function action(...) Remotes.Action:FireServer(...) M.advance(0.1) end
local function touch(part) part.Touched:Fire(root()) M.advance(0.1) end
local function stageFolder()
	for _, child in ipairs(workspace:GetChildren()) do
		if child.Name:match("^Tester_W") then return child end
	end
	return nil
end
local function killAll()
	local folder = stageFolder()
	local guard = 0
	while folder and (attr("EnemiesLeft") or 0) > 0 and guard < 4000 do
		guard += 1
		for _, enemy in ipairs(folder.Enemies:GetChildren()) do
			if enemy.CanCollide ~= false then
				moveTo(enemy.Position + Vector3.new(0, 0, 4))
				humanoid().Health = humanoid().MaxHealth -- keep the tester alive while farming
				throw(1)
				break
			end
		end
	end
	return attr("EnemiesLeft") == 0
end

section("join")
check(attr("Ready") == true, "player data ready")
check(attr("Speed") == 0 and attr("Pad") == 1 and attr("Level") == 1, "fresh stats")
check(player.leaderstats ~= nil and player.leaderstats["🏆 트로피"] ~= nil, "leaderstats")
check(player.PlayerGui:FindFirstChild("Hud") ~= nil, "client HUD built")

section("throwing in lobby")
throw(20)
check(attr("Speed") == 20, "20 throws = 20 speed (got " .. tostring(attr("Speed")) .. ")")
for _ = 1, 10 do Remotes.Throw:FireServer() end
M.advance(0.05)
check(attr("Speed") <= 21, "server rate-limits spam (got " .. tostring(attr("Speed")) .. ")")
M.advance(1)

section("training dummies")
local before = attr("Speed")
moveTo(Vector3.new(-40, 3, 32))
M.advance(5)
check(attr("Speed") > before + 5, "free dummy trains while standing (" .. before .. " -> " .. attr("Speed") .. ")")
before = attr("Speed")
moveTo(Vector3.new(-20, 3, 32))
M.advance(3)
check(attr("Speed") == before, "locked gold dummy does nothing without pass")
moveTo(Vector3.new(0, 3, 0))
M.advance(0.5)

section("world portals")
touch(lobby.Portals.World2.Pad)
check(attr("Stage") == 0, "world 2 locked at low level")
touch(lobby.Portals.World1.Pad)
check(attr("Stage") == 1 and attr("World") == 1, "world 1 portal starts stage 1")
check(attr("EnemiesLeft") == Config.EnemyCount(1, 1), "enemy count matches config")
check(stageFolder() ~= nil and #stageFolder().Enemies:GetChildren() == attr("EnemiesLeft"), "stage map built")

section("clear stage 1 -> go -> clear stage 2 -> bank")
check(killAll(), "stage 1 cleared")
check(attr("Unbanked") == Config.StageReward(1, 1), "stage 1 reward unbanked")
local folder = stageFolder()
check(folder.Gate.CanCollide == false, "gate opens after clear")
touch(folder.NextPortal)
check(attr("Stage") == 2, "green portal goes to stage 2")
check(killAll(), "stage 2 cleared")
local expected = Config.StageReward(1, 1) + Config.StageReward(1, 2)
check(attr("Unbanked") == expected, "unbanked accumulates")
touch(stageFolder().BankPad)
check(attr("Stage") == 0 and attr("Unbanked") == 0, "bank pad returns to lobby")
check(attr("Trophies") == expected, "trophies banked (" .. tostring(attr("Trophies")) .. ")")
check(stageFolder() == nil, "stage map cleaned up")
check((root().Position - Vector3.new(0, 4.5, 0)).Magnitude < 5, "teleported to spawn")

section("throw power pads")
touch(lobby.Pads.Pad3)
check(attr("Pad") == 1, "can't afford pad 3")
touch(lobby.Pads.Pad2)
check(attr("Pad") == 2 and attr("Trophies") == expected - 3, "bought pad 2")
before = attr("Speed")
throw(1)
check(attr("Speed") == before + 2, "pad 2 gives +2 per throw")

section("codes")
action("code", "release")
check(attr("Trophies") == expected - 3 + 50, "code RELEASE gives 50 trophies")
action("code", "RELEASE")
check(attr("Trophies") == expected - 3 + 50, "code can't be reused")
action("code", "nope")
action("code", 123)
before = attr("Speed")
action("code", "WAKPPU")
check(attr("Speed") == before + 1000, "code WAKPPU gives speed")

section("deeper run for trophies")
touch(lobby.Portals.World1.Pad)
for stage = 1, 6 do
	check(killAll(), "cleared stage " .. stage)
	if stage < 6 then touch(stageFolder().NextPortal) end
end
touch(stageFolder().BankPad)
check(attr("Trophies") >= 100, "enough trophies for a skin (" .. attr("Trophies") .. ")")
local bestStages = game:GetService("HttpService"):JSONDecode(attr("BestStagesJson"))
check(bestStages[1] == 6, "best stage recorded as 6")

section("skins")
action("buySkin", "green")
check(attr("Skin") == "green", "bought + equipped green skin")
check(attr("SkinsJson"):find("green") ~= nil, "skin ownership synced")
action("equipSkin", "basic")
check(attr("Skin") == "basic", "re-equip basic")
action("equipSkin", "gold")
check(attr("Skin") == "basic", "can't equip unowned skin")
action("equipBest")
check(attr("Skin") == "green", "equip best picks green")
before = attr("Speed")
throw(1)
check(attr("Speed") == before + 2 * 1.5, "skin multiplies gain (got +" .. (attr("Speed") - before) .. ")")
action("buySkin", "galaxy")
action("buySkin", "crown1")
check(attr("Skin") == "green", "robux/boss skins not granted for free")

section("death loses unbanked")
touch(lobby.Portals.World1.Pad)
killAll()
check(attr("Unbanked") > 0, "has unbanked before death")
local trophiesBefore = attr("Trophies")
humanoid().Health = 0
M.advance(0.2)
check(attr("Unbanked") == 0 and attr("Stage") == 0, "death wipes unbanked and ends run")
check(attr("Trophies") == trophiesBefore, "banked trophies kept after death")
character = M.makeCharacter(player)
M.advance(0.5)

section("falling off the keyboard")
touch(lobby.Portals.World1.Pad)
moveTo(Vector3.new(1000, 200, -50))
M.advance(0.2)
check(attr("Stage") == 0, "falling kills and ends run")
character = M.makeCharacter(player)
M.advance(0.5)

section("enemies attack")
touch(lobby.Portals.World1.Pad)
local enemy = stageFolder().Enemies:GetChildren()[1]
moveTo(enemy.Position + Vector3.new(0, 0, 3))
local hpBefore = humanoid().Health
M.advance(2.5)
check(humanoid().Health < hpBefore, "enemy hurts nearby player")
humanoid().Health = 0
M.advance(0.2)
character = M.makeCharacter(player)
M.advance(0.5)

section("teleport")
local trophies = attr("Trophies")
action("teleport", 1, 3)
check(attr("Stage") == 3, "teleport to stage 3")
check(attr("Trophies") == trophies - Config.TeleportCost(1, 3), "teleport cost charged")
humanoid().Health = 0
M.advance(0.2)
character = M.makeCharacter(player)
M.advance(0.5)
action("teleport", 1, 13)
check(attr("Stage") == 0, "can't teleport past best stage")
action("teleport", 2, 1)
check(attr("Stage") == 0, "can't teleport to locked world")
action("teleport", "x", nil)

section("gift")
before = attr("Speed")
action("gift")
check(attr("Speed") > before and attr("LastGift") > 0, "gift gives speed")
before = attr("Speed")
action("gift")
check(attr("Speed") == before, "gift on cooldown")

section("admin event")
player.Chatted:Fire("/event 10 5")
M.advance(0.1)
check(workspace:GetAttribute("EventMult") == 10, "event multiplier set")
before = attr("Speed")
throw(1)
check(attr("Speed") == before + 2 * 1.5 * 10, "event multiplies gain")
M.advance(301, 1)
check(workspace:GetAttribute("EventMult") == 1, "event expires")

section("game pass purchase")
Config.GamePasses.DoubleSpeed.id = 4242
action("buyPass", "DoubleSpeed")
check(M.prompts[#M.prompts] == 4242, "purchase prompt shown")
game:GetService("MarketplaceService").PromptGamePassPurchaseFinished:Fire(player, 4242, true)
M.advance(0.1)
check(attr("PassesJson"):find("DoubleSpeed") ~= nil, "pass ownership synced")
before = attr("Speed")
throw(1)
check(attr("Speed") == before + 2 * 1.5 * 2, "2x speed pass doubles gain")

section("rebirth")
action("rebirth")
check(attr("Rebirths") == 0, "rebirth blocked below level")
local guard = 0
while attr("Level") < Config.RebirthLevel(0) and guard < 20000 do
	guard += 1
	throw(1)
end
check(attr("Level") >= 15, "reached level 15 by throwing")
local trophiesBeforeRebirth = attr("Trophies")
action("rebirth")
check(attr("Rebirths") == 1 and attr("Speed") == 0 and attr("Level") == 1, "rebirth resets speed/level")
check(attr("Trophies") == trophiesBeforeRebirth and attr("Skin") == "green", "rebirth keeps trophies and skin")
before = attr("Speed")
throw(1)
check(attr("Speed") == 2 * 1.5 * 2 * 1.5, "rebirth multiplier 1.5x applies")

section("leaderboard")
M.advance(70, 1)
local boardGui = lobby.Leaderboard:FindFirstChild("BoardGui")
check(boardGui ~= nil and #boardGui:GetChildren() >= 2, "leaderboard has rows")

section("client UI: press every button")
local hud = player.PlayerGui.Hud
local pressed = 0
for _ = 1, 2 do
	for _, inst in ipairs(hud:GetDescendants()) do
		if inst.ClassName == "TextButton" then
			inst.Activated:Fire()
			pressed += 1
			M.advance(0.05)
		end
	end
end
check(pressed > 40, "pressed " .. pressed .. " buttons")
-- leave any run the button mashing started
if attr("Stage") > 0 then
	humanoid().Health = 0
	M.advance(0.2)
	character = M.makeCharacter(player)
end
M.advance(5)

section("full world 1 clear + boss")
player.Chatted:Fire("/event 1000000 60")
M.advance(0.1)
throw(40)
workspace:SetAttribute("EventEnds", 0)
M.advance(1.5, 0.5)
check(attr("Level") >= 120, "farmed to level " .. attr("Level"))
touch(lobby.Portals.World1.Pad)
for stage = 1, Config.StagesPerWorld do
	check(killAll(), "world 1 stage " .. stage .. " cleared")
	if stage < Config.StagesPerWorld then
		touch(stageFolder().NextPortal)
	end
end
check(stageFolder().NextPortal == nil, "last stage has no next portal")
check(attr("SkinsJson"):find("crown1") ~= nil, "boss drops world 1 crown skin")
local unbankedFinal = attr("Unbanked")
local trophiesBeforeBank = attr("Trophies")
touch(stageFolder().BankPad)
check(attr("Trophies") == trophiesBeforeBank + unbankedFinal * 1, "world clear banked")
touch(lobby.Portals.World2.Pad)
check(attr("World") == 2 and attr("Stage") == 1, "world 2 unlocked at level 120+")
check(killAll(), "world 2 stage 1 cleared")
touch(stageFolder().BankPad)
M.advance(1)

section("save + reload")
local savedSpeed = attr("Speed")
local savedTrophies = attr("Trophies")
player.Parent = nil
Players.PlayerRemoving:Fire(player)
M.advance(0.5)
local again = M.makePlayer("Tester", 777)
M.remoteHub.localPlayer = again
Players.PlayerAdded:Fire(again)
M.advance(0.5)
if M.datastoreDisabled then
	check(again:GetAttribute("Speed") == 0, "no datastore: starts fresh, no crash")
else
	check(again:GetAttribute("Speed") == savedSpeed, "speed persisted (" .. tostring(again:GetAttribute("Speed")) .. " vs " .. savedSpeed .. ")")
	check(again:GetAttribute("Trophies") == savedTrophies, "trophies persisted")
	check(again:GetAttribute("Skin") == "green" and again:GetAttribute("Rebirths") == 1, "skin + rebirths persisted")
end
for _, fn in ipairs(M.closeHandlers) do task.spawn(fn) end
M.advance(2)

print(string.format("\nRESULT: %d passed, %d failed, %d script errors", passed, failed, #M.errors))
for _, err in ipairs(M.errors) do print("SCRIPT ERROR: " .. err) end

for _, w in ipairs(M.warnings) do print("WARN: " .. w) end
if failed > 0 or #M.errors > 0 then
	error("playtest failed")
end
