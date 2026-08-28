-- Move the categories that are wearing the app's state colours.
--
-- Four values in the palette were the interface's own signals, exactly: `#de6b5e` is
-- `--color-danger`, `#5fb88a` is `--color-ok`, `#d9a441` is `--color-gold` and
-- `#8a909e` is `--color-muted`. The seeded categories duly took three of them, so
-- "Bills & utilities" was permanently painted the red that everywhere else means
-- overspent, and "Groceries" and "Salary" the green that means income.
--
-- Nothing draws a category's colour any more, so this changes nothing on screen today.
-- It is here so the stored data stops contradicting the palette: anything a screen can
-- colour to mean a state must not also be available to mean a name, and a row that
-- still holds one is a trap waiting for whoever adds a colour picker back.
--
-- Only rows holding one of the four are touched. A colour anybody chose deliberately
-- that is not a state colour is left exactly as it is.

update money_categories
set color = case color
  when '#de6b5e' then '#c97fc0'  -- danger red -> orchid
  when '#5fb88a' then '#8fb85f'  -- ok green   -> leaf
  when '#d9a441' then '#b08968'  -- brand gold -> clay
  when '#8a909e' then '#6b7185'  -- muted grey -> slate
  else color
end
where color in ('#de6b5e', '#5fb88a', '#d9a441', '#8a909e');

-- Goals are drawn from their own colour too, so the same trap applies to them.
update money_goals
set color = case color
  when '#de6b5e' then '#c97fc0'
  when '#5fb88a' then '#8fb85f'
  when '#d9a441' then '#b08968'
  when '#8a909e' then '#6b7185'
  else color
end
where color in ('#de6b5e', '#5fb88a', '#d9a441', '#8a909e');

-- And the two pairs that were duplicates of each other in the seed: ten categories
-- were sharing eight colours, which is how a colour stops being an identifier.
update money_categories set color = '#d6759b'
where name = 'Fun' and color = '#a98bd6';

update money_categories set color = '#7a86d6'
where name = 'Learning' and color = '#5b8fd6';
