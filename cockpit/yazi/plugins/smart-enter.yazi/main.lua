--- @sync entry

return {
	entry = function()
		local hovered = cx.active.current.hovered
		local action = hovered and hovered.cha.is_dir and "enter" or "open"
		ya.emit(action, { hovered = true })
	end,
}
