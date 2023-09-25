import { z, defineCollection } from 'astro:content';

const blogCollection = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        author: z.string(),
        tags: z.array(z.string()),
        image: z.string().optional(),
        date: z.date(),
    }),
});

export const collections = {
    'blog': blogCollection,
};