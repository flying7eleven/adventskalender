-- Empty strings are equivalent to "no package selected" and are stored as NULL. This also
-- keeps the unique index below from treating multiple empty strings as duplicates.
UPDATE participants SET present_identifier = NULL WHERE present_identifier = '';

-- A package may only be assigned to one winner per day. The partial index excludes cleared
-- (NULL) packages, so any number of winners per day can stay without a package.
CREATE UNIQUE INDEX unique_present_per_day ON participants (won_on, present_identifier) WHERE present_identifier IS NOT NULL;
