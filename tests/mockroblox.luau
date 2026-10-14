-- Minimal fake Roblox engine for running the game's server + client scripts headlessly.
-- Virtual clock, coroutine scheduler, Instance tree, signals, datatypes, services.

local ROOT = __ROOT -- repo root, injected by the test file
local realOs = os

local M = {}
M.log = {}
local function log(...) table.insert(M.log, table.concat({ ... }, " ")) end
M.logf = log
M.warnings = {}
warn = function(...) table.insert(M.warnings, table.concat({ ... }, " ")) end

-- clock & scheduler ---------------------------------------------------------------
local now = 1000
local unix = 1800000000
local tasks = {}
M.errors = {}

local function resume(co, ...)
	local ok, err = coroutine.resume(co, ...)
	if not ok then
		table.insert(M.errors, debug.traceback(co, tostring(err)))
	end
end

local function spawnFn(fn, ...)
	local co = type(fn) == "thread" and fn or coroutine.create(fn)
	resume(co, ...)
	return co
end

task = {
	spawn = spawnFn,
	defer = spawnFn,
	wait = function(t)
		local co = coroutine.running()
		table.insert(tasks, { co = co, wake = now + (t or 0.03) })
		coroutine.yield()
		return t or 0.03
	end,
	delay = function(t, fn, ...)
		local args = { ... }
		local co = coroutine.create(function()
			fn(table.unpack(args))
		end)
		table.insert(tasks, { co = co, wake = now + (t or 0) })
		return co
	end,
}

os = setmetatable({
	clock = function() return now end,
	time = function() return math.floor(unix + (now - 1000)) end,
}, { __index = realOs })

-- signals ---------------------------------------------------------------------------
local Signal = {}
Signal.__index = Signal
function Signal.new() return setmetatable({ handlers = {} }, Signal) end
function Signal:Connect(fn)
	local entry = { fn = fn, connected = true }
	table.insert(self.handlers, entry)
	return { Disconnect = function() entry.connected = false end, Connected = true }
end
Signal.connect = Signal.Connect
function Signal:Once(fn)
	local c
	c = self:Connect(function(...) c.Disconnect() fn(...) end)
	return c
end
function Signal:Fire(...)
	for _, entry in ipairs(table.clone(self.handlers)) do
		if entry.connected then
			spawnFn(entry.fn, ...)
		end
	end
end
function Signal:Wait()
	local co = coroutine.running()
	local c
	c = self:Connect(function(...) c.Disconnect() resume(co, ...) end)
	return coroutine.yield()
end
M.Signal = Signal

-- datatypes -------------------------------------------------------------------------
local V3 = {}
V3.__index = function(v, k)
	if k == "Magnitude" then return math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z) end
	if k == "Unit" then local m = math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z) if m == 0 then return v end return Vector3.new(v.X / m, v.Y / m, v.Z / m) end
	if k == "Lerp" then return function(a, b, t) return a + (b - a) * t end end
	if k == "Dot" then return function(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end end
	return nil
end
V3.__add = function(a, b) return Vector3.new(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
V3.__sub = function(a, b) return Vector3.new(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
V3.__mul = function(a, b)
	if type(a) == "number" then a, b = b, a end
	if type(b) == "number" then return Vector3.new(a.X * b, a.Y * b, a.Z * b) end
	return Vector3.new(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
V3.__div = function(a, b) return Vector3.new(a.X / b, a.Y / b, a.Z / b) end
V3.__unm = function(a) return Vector3.new(-a.X, -a.Y, -a.Z) end
V3.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
V3.__tostring = function(v) return string.format("(%g, %g, %g)", v.X, v.Y, v.Z) end
Vector3 = { new = function(x, y, z) return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0, __type = "Vector3" }, V3) end }
Vector3.zero = Vector3.new(0, 0, 0)
Vector3.one = Vector3.new(1, 1, 1)

local CF = {}
CF.__index = function(c, k)
	if k == "Position" or k == "p" then return c._pos end
	if k == "LookVector" then return c._look end
	if k == "X" then return c._pos.X end
	if k == "Y" then return c._pos.Y end
	if k == "Z" then return c._pos.Z end
	return nil
end
local function cf(pos, look) return setmetatable({ _pos = pos, _look = look or Vector3.new(0, 0, -1), __type = "CFrame" }, CF) end
CF.__mul = function(a, b)
	if getmetatable(b) == V3 then return a._pos + b end
	return cf(a._pos + b._pos, a._look)
end
CF.__add = function(a, b) return cf(a._pos + b, a._look) end
CF.__sub = function(a, b) return cf(a._pos - b, a._look) end
CFrame = {
	new = function(x, y, z)
		if type(x) == "table" then return cf(x) end
		return cf(Vector3.new(x or 0, y or 0, z or 0))
	end,
	lookAt = function(a, b)
		local d = b - a
		return cf(a, d.Magnitude > 0 and d.Unit or Vector3.new(0, 0, -1))
	end,
	Angles = function() return cf(Vector3.zero) end,
}

local function simple(typeName, fields)
	return setmetatable(fields, { __index = function(_, k) if k == "__type" then return typeName end return nil end })
end
Color3 = {
	new = function(r, g, b) return Color3._make(r or 0, g or 0, b or 0) end,
	fromRGB = function(r, g, b) return Color3._make((r or 0) / 255, (g or 0) / 255, (b or 0) / 255) end,
	fromHSV = function() return Color3._make(1, 0, 0) end,
}
local C3 = {}
C3.__index = {
	Lerp = function(a, b, t) return Color3._make(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t) end,
}
C3.__eq = function(a, b) return a.R == b.R and a.G == b.G and a.B == b.B end
function Color3._make(r, g, b) return setmetatable({ R = r, G = g, B = b }, C3) end

Vector2 = { new = function(x, y) return simple("Vector2", { X = x or 0, Y = y or 0 }) end }
UDim = { new = function(s, o) return simple("UDim", { Scale = s, Offset = o }) end }
UDim2 = {
	new = function(xs, xo, ys, yo) return simple("UDim2", { X = UDim.new(xs, xo), Y = UDim.new(ys, yo) }) end,
	fromOffset = function(x, y) return UDim2.new(0, x, 0, y) end,
	fromScale = function(x, y) return UDim2.new(x, 0, y, 0) end,
}
TweenInfo = { new = function(...) return simple("TweenInfo", { args = { ... } }) end }
ColorSequence = { new = function(...) return simple("ColorSequence", { args = { ... } }) end }
ColorSequenceKeypoint = { new = function(...) return simple("ColorSequenceKeypoint", { args = { ... } }) end }
NumberSequence = { new = function(...) return simple("NumberSequence", { args = { ... } }) end }
NumberSequenceKeypoint = { new = function(...) return simple("NumberSequenceKeypoint", { args = { ... } }) end }
NumberRange = { new = function(a, b) return simple("NumberRange", { Min = a, Max = b or a }) end }
Random = {
	new = function()
		return {
			NextNumber = function(_, a, b) a = a or 0 b = b or 1 return a + (b - a) * math.random() end,
			NextInteger = function(_, a, b) return math.random(a, b) end,
		}
	end,
}

local enumCache = {}
Enum = setmetatable({}, {
	__index = function(_, enumName)
		enumCache[enumName] = enumCache[enumName] or setmetatable({}, {
			__index = function(t, item)
				local v = { Name = item, EnumType = enumName }
				rawset(t, item, v)
				return v
			end,
		})
		return enumCache[enumName]
	end,
})

-- instances -------------------------------------------------------------------------
local SIGNAL_NAMES = {
	Touched = true, Activated = true, Died = true, CharacterAdded = true, Chatted = true,
	OnServerEvent = true, OnClientEvent = true, Changed = true, AttributeChanged = true,
	Heartbeat = true, RenderStepped = true, Stepped = true, PlayerAdded = true, PlayerRemoving = true,
	PromptGamePassPurchaseFinished = true, InputBegan = true, InputEnded = true, FocusLost = true,
	MouseButton1Click = true, ChildAdded = true,
}
local BASES = {
	Part = { "BasePart", "PVInstance" }, SpawnLocation = { "Part", "BasePart" },
	Frame = { "GuiObject", "GuiBase2d" }, TextLabel = { "GuiObject", "GuiBase2d" }, TextButton = { "GuiObject", "GuiButton", "GuiBase2d" },
	TextBox = { "GuiObject" }, ScrollingFrame = { "GuiObject" }, ImageLabel = { "GuiObject" },
	Model = { "PVInstance" }, ScreenGui = { "LayerCollector" }, BillboardGui = { "LayerCollector" }, SurfaceGui = { "LayerCollector" },
	IntValue = { "ValueBase" }, StringValue = { "ValueBase" },
}

local Inst = {}
local methods = {}
M.allInstances = 0

local function newInstance(className, props)
	local self = setmetatable({ _class = className, _props = props or {}, _children = {}, _attrs = {}, _signals = {}, _attrSignals = {}, _propSignals = {} }, Inst)
	rawset(self, "_name", className)
	M.allInstances += 1
	return self
end
M.newInstance = newInstance

local SPECIAL = {}

Inst.__index = function(self, key)
	if key == "ClassName" then return rawget(self, "_class") end
	if key == "Name" then return rawget(self, "_name") end
	if key == "Parent" then return rawget(self, "_parent") end
	if methods[key] then return methods[key] end
	local special = SPECIAL[rawget(self, "_class")]
	if special and special.get then
		local handled, value = special.get(self, key)
		if handled then return value end
	end
	local props = rawget(self, "_props")
	if props[key] ~= nil then return props[key] end
	if SIGNAL_NAMES[key] then
		local s = Signal.new()
		props[key] = s
		return s
	end
	for _, child in ipairs(rawget(self, "_children")) do
		if child.Name == key then return child end
	end
	return nil
end

Inst.__newindex = function(self, key, value)
	if key == "Parent" then
		local old = rawget(self, "_parent")
		if old then
			local list = rawget(old, "_children")
			for i, c in ipairs(list) do if c == self then table.remove(list, i) break end end
		end
		rawset(self, "_parent", value)
		if value then
			if rawget(value, "_destroyed") then error("Parent is locked (destroyed)") end
			table.insert(rawget(value, "_children"), self)
		end
		return
	end
	if key == "Name" then rawset(self, "_name", value) return end
	if rawget(self, "_locked") then error("cannot set " .. key .. " on locked instance") end
	local special = SPECIAL[rawget(self, "_class")]
	if special and special.set and special.set(self, key, value) then return end
	rawget(self, "_props")[key] = value
	local ps = rawget(self, "_propSignals")[key]
	if ps then ps:Fire() end
end
Inst.__tostring = function(self) return rawget(self, "_name") end

function methods.FindFirstChild(self, name, recursive)
	for _, child in ipairs(rawget(self, "_children")) do
		if child.Name == name then return child end
		if recursive then local r = child:FindFirstChild(name, true) if r then return r end end
	end
	return nil
end
function methods.WaitForChild(self, name)
	local c = self:FindFirstChild(name)
	if not c then error("WaitForChild: '" .. tostring(name) .. "' not found in " .. self:GetFullName()) end
	return c
end
function methods.GetChildren(self) return table.clone(rawget(self, "_children")) end
function methods.GetDescendants(self)
	local out = {}
	for _, c in ipairs(rawget(self, "_children")) do
		table.insert(out, c)
		for _, d in ipairs(c:GetDescendants()) do table.insert(out, d) end
	end
	return out
end
function methods.IsA(self, className)
	if rawget(self, "_class") == className or className == "Instance" then return true end
	for _, b in ipairs(BASES[rawget(self, "_class")] or {}) do if b == className then return true end end
	return false
end
function methods.FindFirstChildOfClass(self, className)
	for _, c in ipairs(rawget(self, "_children")) do if rawget(c, "_class") == className then return c end end
	return nil
end
function methods.FindFirstChildWhichIsA(self, className)
	for _, c in ipairs(rawget(self, "_children")) do if c:IsA(className) then return c end end
	return nil
end
function methods.IsDescendantOf(self, other)
	local p = rawget(self, "_parent")
	while p do if p == other then return true end p = rawget(p, "_parent") end
	return false
end
function methods.Destroy(self)
	self.Parent = nil
	rawset(self, "_destroyed", true)
	for _, c in ipairs(table.clone(rawget(self, "_children"))) do c:Destroy() end
end
function methods.ClearAllChildren(self)
	for _, c in ipairs(table.clone(rawget(self, "_children"))) do c:Destroy() end
end
function methods.Clone(self)
	local copy = newInstance(rawget(self, "_class"), table.clone(rawget(self, "_props")))
	rawset(copy, "_name", rawget(self, "_name"))
	for _, c in ipairs(rawget(self, "_children")) do c:Clone().Parent = copy end
	return copy
end
function methods.GetFullName(self)
	local parts = {}
	local cur = self
	while cur do table.insert(parts, 1, cur.Name) cur = rawget(cur, "_parent") end
	return table.concat(parts, ".")
end
function methods.SetAttribute(self, name, value)
	local t = type(value)
	if value ~= nil and t ~= "number" and t ~= "string" and t ~= "boolean" and not (t == "table" and (getmetatable(value) == V3 or getmetatable(value) == C3)) then
		error("SetAttribute: unsupported type " .. t .. " for " .. name)
	end
	if value ~= value then error("SetAttribute: NaN for " .. name) end
	local attrs = rawget(self, "_attrs")
	if attrs[name] == value then return end
	attrs[name] = value
	self.AttributeChanged:Fire(name)
	local s = rawget(self, "_attrSignals")[name]
	if s then s:Fire() end
end
function methods.GetAttribute(self, name) return rawget(self, "_attrs")[name] end
function methods.GetAttributeChangedSignal(self, name)
	local list = rawget(self, "_attrSignals")
	list[name] = list[name] or Signal.new()
	return list[name]
end
function methods.GetPropertyChangedSignal(self, name)
	local list = rawget(self, "_propSignals")
	list[name] = list[name] or Signal.new()
	return list[name]
end
function methods.PivotTo(self, cframe)
	local root = self:FindFirstChild("HumanoidRootPart")
	if root then root.CFrame = cframe end
end
function methods.GetService(self, name)
	local s = self:FindFirstChild(name)
	if not s then error("unknown service " .. name) end
	return s
end

-- BasePart: keep Position and CFrame in sync
local function partSpecial()
	return {
		get = function(self, key)
			local props = rawget(self, "_props")
			if key == "Position" then return true, (props.CFrame and props.CFrame.Position) or Vector3.zero end
			if key == "CFrame" then return true, props.CFrame or CFrame.new(0, 0, 0) end
			return false
		end,
		set = function(self, key, value)
			local props = rawget(self, "_props")
			if key == "Position" then props.CFrame = CFrame.new(value) return true end
			return false
		end,
	}
end
SPECIAL.Part = partSpecial()
SPECIAL.SpawnLocation = partSpecial()
SPECIAL.Humanoid = {
	set = function(self, key, value)
		if key == "Health" then
			local props = rawget(self, "_props")
			local was = props.Health or 100
			props.Health = math.clamp(value, 0, props.MaxHealth or 100)
			if was > 0 and props.Health <= 0 then self.Died:Fire() end
			return true
		end
		return false
	end,
}
SPECIAL.Attachment = { set = function(self, key, value) if key == "WorldPosition" then rawget(self, "_props").Position = value return true end return false end }

function methods.TakeDamage(self, n) self.Health = (self.Health or 100) - n end
function methods.Play() end
function methods.Stop() end
function methods.Disconnect() end
function methods.CaptureFocus() end

local remoteHub = { localPlayer = nil }
function methods.FireServer(self, ...) self.OnServerEvent:Fire(remoteHub.localPlayer, ...) end
function methods.FireClient(self, _player, ...) self.OnClientEvent:Fire(...) end
function methods.FireAllClients(self, ...) self.OnClientEvent:Fire(...) end
M.remoteHub = remoteHub

Instance = {
	new = function(className, parent)
		local inst = newInstance(className)
		if className == "Part" or className == "SpawnLocation" then
			rawget(inst, "_props").Size = Vector3.new(4, 1, 2)
		end
		if parent then inst.Parent = parent end
		return inst
	end,
}

-- services / DataModel ------------------------------------------------------------------
game = newInstance("DataModel")
game.Name = "game"
local function service(name)
	local s = newInstance(name)
	s.Name = name
	s.Parent = game
	return s
end
workspace = service("Workspace")
local camera = newInstance("Camera")
camera.Name = "Camera"
camera.Parent = workspace
camera.ViewportSize = Vector2.new(1280, 720)
workspace.CurrentCamera = camera
local terrain = newInstance("Terrain") terrain.Name = "Terrain" terrain.Parent = workspace
local Players = service("Players")
local ReplicatedStorage = service("ReplicatedStorage")
local ServerScriptService = service("ServerScriptService")
service("Lighting")
local RunService = service("RunService")
local HttpService = service("HttpService")
local MessagingService = service("MessagingService")
local MarketplaceService = service("MarketplaceService")
local DataStoreService = service("DataStoreService")
local TweenService = service("TweenService")
local Debris = service("Debris")
local UserInputService = service("UserInputService")
service("SoundService")
service("StarterPlayer")

rawget(game, "_props").CreatorType = Enum.CreatorType.User
rawget(game, "_props").CreatorId = 1
local closeHandlers = {}
rawget(game, "_props").BindToClose = function(_, fn) table.insert(closeHandlers, fn) end
M.closeHandlers = closeHandlers

rawget(RunService, "_props").IsStudio = function() return true end
rawget(RunService, "_props").IsServer = function() return true end
rawget(TweenService, "_props").Create = function(_, inst, _info, goals)
	return { Play = function() for k, v in pairs(goals) do inst[k] = v end end, Completed = Signal.new() }
end
rawget(Debris, "_props").AddItem = function(_, inst, t)
	task.delay(t or 10, function() if not rawget(inst, "_destroyed") then inst:Destroy() end end)
end

-- JSON
local function encode(v)
	local t = type(v)
	if t == "nil" then return "null" end
	if t == "boolean" then return tostring(v) end
	if t == "number" then return string.format("%.17g", v) end
	if t == "string" then return '"' .. v:gsub('[%c"\\]', function(c) return string.format("\\u%04x", string.byte(c)) end) .. '"' end
	local n = 0
	for _ in pairs(v) do n += 1 end
	if n == #v then
		local parts = {}
		for i = 1, #v do parts[i] = encode(v[i]) end
		return "[" .. table.concat(parts, ",") .. "]"
	end
	local parts = {}
	for k, val in pairs(v) do
		if type(k) ~= "string" then error("JSONEncode: mixed key types") end
		table.insert(parts, encode(k) .. ":" .. encode(val))
	end
	return "{" .. table.concat(parts, ",") .. "}"
end
local function decode(s)
	local i = 1
	local function ws() while s:sub(i, i):match("%s") do i += 1 end end
	local value
	function value()
		ws()
		local c = s:sub(i, i)
		if c == "{" then
			i += 1
			local out = {}
			ws()
			if s:sub(i, i) == "}" then i += 1 return out end
			while true do
				ws()
				local k = value()
				ws() i += 1 -- :
				out[k] = value()
				ws()
				local d = s:sub(i, i) i += 1
				if d == "}" then return out end
			end
		elseif c == "[" then
			i += 1
			local out = {}
			ws()
			if s:sub(i, i) == "]" then i += 1 return out end
			while true do
				table.insert(out, value())
				ws()
				local d = s:sub(i, i) i += 1
				if d == "]" then return out end
			end
		elseif c == '"' then
			local j = i + 1
			local buf = {}
			while s:sub(j, j) ~= '"' do
				if s:sub(j, j) == "\\" then
					local hex = s:sub(j + 2, j + 5)
					table.insert(buf, string.char(tonumber(hex, 16)))
					j += 6
				else
					table.insert(buf, s:sub(j, j))
					j += 1
				end
			end
			i = j + 1
			return table.concat(buf)
		elseif s:sub(i, i + 3) == "true" then i += 4 return true
		elseif s:sub(i, i + 4) == "false" then i += 5 return false
		elseif s:sub(i, i + 3) == "null" then i += 4 return nil
		else
			local num = s:match("^-?[%d%.eE+-]+", i)
			i += #num
			return tonumber(num)
		end
	end
	return value()
end
rawget(HttpService, "_props").JSONEncode = function(_, v) return encode(v) end
rawget(HttpService, "_props").JSONDecode = function(_, s) return decode(s) end

local subscribers = {}
rawget(MessagingService, "_props").SubscribeAsync = function(_, topic, fn) subscribers[topic] = fn end
rawget(MessagingService, "_props").PublishAsync = function(_, topic, data) if subscribers[topic] then subscribers[topic]({ Data = data }) end end

M.prompts = {}
M.ownedPasses = {}
rawget(MarketplaceService, "_props").UserOwnsGamePassAsync = function(_, _uid, id) return M.ownedPasses[id] == true end
rawget(MarketplaceService, "_props").PromptGamePassPurchase = function(_, player, id) table.insert(M.prompts, id) end

-- in-memory DataStore (set M.datastoreDisabled = true to mimic Studio without API access)
M.store = {}
M.ordered = {}
rawget(DataStoreService, "_props").GetDataStore = function(_, name)
	if M.datastoreDisabled then error("StudioAccessToApisNotAllowed") end
	M.store[name] = M.store[name] or {}
	local data = M.store[name]
	return {
		GetAsync = function(_, key) return data[key] and decode(data[key]) end,
		SetAsync = function(_, key, value) data[key] = encode(value) end,
	}
end
rawget(DataStoreService, "_props").GetOrderedDataStore = function(_, name)
	if M.datastoreDisabled then error("StudioAccessToApisNotAllowed") end
	M.ordered[name] = M.ordered[name] or {}
	local data = M.ordered[name]
	return {
		SetAsync = function(_, key, value)
			if type(value) ~= "number" or value ~= math.floor(value) then error("OrderedDataStore needs integer") end
			data[key] = value
		end,
		GetSortedAsync = function(_, ascending, size)
			local list = {}
			for k, v in pairs(data) do table.insert(list, { key = k, value = v }) end
			table.sort(list, function(a, b) if ascending then return a.value < b.value end return a.value > b.value end)
			local page = {}
			for i = 1, math.min(size, #list) do page[i] = list[i] end
			return { GetCurrentPage = function() return page end }
		end,
	}
end

rawget(Players, "_props").GetPlayers = function(self)
	local out = {}
	for _, c in ipairs(self:GetChildren()) do if c.ClassName == "Player" then table.insert(out, c) end end
	return out
end
rawget(Players, "_props").GetPlayerFromCharacter = function(self, model)
	for _, p in ipairs(self:GetPlayers()) do if p.Character == model and model ~= nil then return p end end
	return nil
end
rawget(Players, "_props").GetNameFromUserIdAsync = function(_, id) return "User" .. tostring(id) end

-- scripts & require ---------------------------------------------------------------------
local moduleCache = {}
local function runSource(scriptInst, path, isModule)
	local source = __readfile(path)
	local env = setmetatable({ script = scriptInst }, { __index = _G })
	local fn = __load(source, path, env)
	if isModule then return fn() end
	spawnFn(fn)
end
require = function(moduleScript)
	if moduleCache[moduleScript] ~= nil then return moduleCache[moduleScript] end
	local path = rawget(moduleScript, "_props").__path
	if not path then error("require: not a ModuleScript " .. tostring(moduleScript)) end
	local result = runSource(moduleScript, path, true)
	moduleCache[moduleScript] = result
	return result
end

local function mountFolder(parent, folderName, dir, files)
	local folder = newInstance("Folder")
	folder.Name = folderName
	folder.Parent = parent
	local scripts = {}
	for _, file in ipairs(files) do
		local base = file:gsub("%.luau$", "")
		local className, name = "ModuleScript", base
		if base:match("%.server$") then className, name = "Script", base:gsub("%.server$", "") end
		if base:match("%.client$") then className, name = "LocalScript", base:gsub("%.client$", "") end
		local s = newInstance(className)
		s.Name = name
		rawget(s, "_props").__path = ROOT .. "/" .. dir .. "/" .. file
		s.Parent = folder
		if className ~= "ModuleScript" then table.insert(scripts, s) end
	end
	return folder, scripts
end
M.mountFolder = mountFolder
M.runSource = runSource

function M.advance(seconds, step)
	step = step or 1 / 30
	local target = now + seconds
	while now < target do
		now += step
		RunService.Heartbeat:Fire(step)
		RunService.RenderStepped:Fire(step)
		local due = {}
		local keep = {}
		for _, t in ipairs(tasks) do
			if t.wake <= now then table.insert(due, t) else table.insert(keep, t) end
		end
		tasks = keep
		for _, t in ipairs(due) do
			if coroutine.status(t.co) == "suspended" then resume(t.co) end
		end
	end
end
function M.now() return now end

-- player & character -------------------------------------------------------------------
function M.makeCharacter(player)
	local character = newInstance("Model")
	character.Name = player.Name
	local root = Instance.new("Part")
	root.Name = "HumanoidRootPart"
	root.CFrame = CFrame.new(0, 4, 0)
	root.Parent = character
	local humanoid = newInstance("Humanoid")
	humanoid.Name = "Humanoid"
	rawget(humanoid, "_props").MaxHealth = 100
	rawget(humanoid, "_props").Health = 100
	rawget(humanoid, "_props").WalkSpeed = 16
	rawget(humanoid, "_props").CameraOffset = Vector3.zero
	humanoid.Parent = character
	character.Parent = workspace
	player.Character = character
	player.CharacterAdded:Fire(character)
	return character
end

function M.makePlayer(name, userId)
	local player = newInstance("Player")
	player.Name = name
	rawget(player, "_props").UserId = userId
	local gui = newInstance("PlayerGui")
	gui.Name = "PlayerGui"
	gui.Parent = player
	player.Parent = Players
	return player
end

return M
