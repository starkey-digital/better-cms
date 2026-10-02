import 'dotenv/config';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { betterAuthContext } from 'better-cms/auth/better-auth';
import { collection, createCms, image, slug } from 'better-cms/sveltekit/server';
import { z } from 'zod';
import { auth } from '../../server/auth.ts';

export const SiteSchema = z.object({
	headline: z.array(z.string()).meta({
		label: 'Headline lines',
		description: 'The big lines at the top of the home page, one per row.',
		itemLabel: 'Line',
	}),
	about: z.string().meta({
		label: 'About the band',
		description: 'A few sentences about who you are.',
		multiline: true,
	}),
	patreonUrl: z.url().optional().meta({
		label: 'Patreon link',
		description: 'Where people go to support you monthly.',
		placeholder: 'https://www.patreon.com/yourband',
	}),
	supportWays: z
		.array(
			z.object({
				label: z.string().meta({ label: 'Name' }),
				description: z.string().optional().meta({ label: 'What it is' }),
				url: z.url().optional().meta({ label: 'Link' }),
			}),
		)
		.meta({
			label: 'Ways to support us',
			description: 'Shown as a list on the support page.',
			itemLabel: 'Way to support',
		}),
});

export const ShowSchema = z.object({
	date: z.date().meta({ label: 'Date', dateOnly: true }),
	venue: z.string().min(1).meta({ label: 'Venue', placeholder: 'The Fleece' }),
	city: z.string().optional().meta({ label: 'City' }),
	ticketUrl: z
		.url()
		.optional()
		.meta({ label: 'Ticket link', description: 'Leave empty if tickets are on the door.' }),
});

export const ReleaseSchema = z.object({
	title: z.string().min(1).meta({ label: 'Title' }),
	slug: slug().meta({ label: 'Web address' }),
	type: z.enum(['EP', 'Single', 'Album']).meta({ label: 'Type' }),
	releaseDate: z.date().meta({ label: 'Release date', dateOnly: true }),
	cover: image().optional().meta({ label: 'Cover art' }),
	tracks: z
		.array(z.string())
		.meta({ label: 'Track list', description: 'In playing order.', itemLabel: 'Track' }),
	listenUrl: z.url().optional().meta({ label: 'Listen link' }),
	buyUrl: z.url().optional().meta({ label: 'Buy link' }),
});

// Only accounts with role "admin" get a ctx at all; everyone else is anonymous.
const context = betterAuthContext(auth, { allow: { roles: ['admin'] } });

export const cms = createCms({
	collections: ({ singleton }) => ({
		site: singleton({
			schema: SiteSchema,
			label: 'Home page',
			description: 'The words and links on the main page of your website.',
			admin: { previewUrl: '/' },
		}),
		shows: collection({
			schema: ShowSchema,
			label: 'Shows',
			description: 'Gigs listed on your website. Past ones can stay or go.',
			admin: {
				title: '{date} {venue}',
				sort: { field: 'date', direction: 'asc' },
				previewUrl: '/#shows',
				group: 'Live',
			},
		}),
		releases: collection({
			schema: ReleaseSchema,
			label: 'Releases',
			description: 'Your records, with track lists and where to hear them.',
			admin: {
				title: 'title',
				sort: { field: 'releaseDate', direction: 'desc' },
				previewUrl: '/releases/{slug}',
				group: 'Music',
			},
		}),
	}),
	basePath: '/api/cms',
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL ?? 'file:./local.db',
		authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
	}),
	auth: { context },
	access: {
		read: () => true,
		create: (ctx) => ctx?.user.role === 'admin',
		update: (ctx) => ctx?.user.role === 'admin',
		delete: (ctx) => ctx?.user.role === 'admin',
	},
});

export default cms;
export type Cms = typeof cms;
