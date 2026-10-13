-- 큰 숫자를 1.23K, 4.5M 처럼 짧게 보여줍니다

local Format = {}

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }

function Format.Short(n)
	n = n or 0
	if n < 0 then
		return "-" .. Format.Short(-n)
	end
	if n < 1000 then
		return tostring(math.floor(n))
	end
	local index = 1
	while n >= 1000 and index < #SUFFIXES do
		n /= 1000
		index += 1
	end
	local text = string.format("%.2f", n):gsub("0+$", ""):gsub("%.$", "")
	return text .. SUFFIXES[index]
end

return Format
