CREATE TABLE `submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landmark_id` varchar(128) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`type` enum('edit','correction','photo_suggestion') NOT NULL DEFAULT 'edit',
	`payload` json NOT NULL,
	`note` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`ai_score` int,
	`ai_flags` json,
	`ai_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	`reviewed_by` varchar(64),
	`reviewer_note` text,
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`)
);
