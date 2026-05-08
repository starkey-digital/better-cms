import { collection, image, richText, singleton, slug } from 'better-cms/zod';
import { z } from 'zod';

export const PostSchema = z.object({
	title: z.string().min(1).max(120),
	slug: slug(),
	excerpt: z.string().max(500).optional(),
	body: richText().optional(),
	cover: image().optional(),
	published: z.boolean().default(false),
});

export const SettingsSchema = z.object({
	siteTitle: z.string().min(1),
	tagline: z.string().optional(),
});

export const posts = collection({ schema: PostSchema });
export const settings = singleton({ schema: SettingsSchema });

export const collections = { posts, settings };

export type Post = z.infer<typeof PostSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
