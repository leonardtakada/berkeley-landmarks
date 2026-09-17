CREATE TABLE `login_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`attempts` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_codes_id` PRIMARY KEY(`id`)
);
