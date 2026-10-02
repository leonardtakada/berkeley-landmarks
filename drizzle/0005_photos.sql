-- The photos table has been in the schema (and the snapshots) since 0001,
-- but no migration ever created it.
CREATE TABLE IF NOT EXISTS `photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landmark_id` varchar(128) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`photo_url` varchar(512) NOT NULL,
	`caption` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	`reviewed_by` varchar(64),
	CONSTRAINT `photos_id` PRIMARY KEY(`id`)
);
