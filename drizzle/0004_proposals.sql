CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`address` varchar(300) NOT NULL,
	`why` text NOT NULL,
	`architect` varchar(300),
	`year_built` varchar(100),
	`style` varchar(200),
	`photo_urls` json,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	`reviewed_by` varchar(64),
	`reviewer_note` text,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
