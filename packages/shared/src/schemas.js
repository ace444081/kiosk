import { z } from 'zod';
import {
  LOCALES,
  MAX_QUANTITY,
  MIN_QUANTITY,
  MAX_CART_LINES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
} from './constants.js';

export const localeSchema = z.enum(LOCALES);

export const orderItemSchema = z
  .object({
    productId: z.string().min(1, 'required'),
    quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY),
    addonIds: z.array(z.string().min(1)).default([]),
    optionIds: z.array(z.string().min(1)).default([]),
  })
  // NOT strict: unknown fields (e.g. a client-supplied price) are stripped
  // and ignored; the server always prices from the live catalog.
  .passthrough()
  .superRefine((item, ctx) => {
    if (new Set(item.addonIds).size !== item.addonIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['addonIds'],
        message: 'Add-ons must be selected only once',
      });
    }
    if (new Set(item.optionIds).size !== item.optionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['optionIds'],
        message: 'Options must be selected only once',
      });
    }
  });

export const createOrderSchema = z
  .object({
    locale: localeSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    items: z.array(orderItemSchema).min(1, 'empty').max(MAX_CART_LINES, 'too_many'),
  })
  .passthrough();

export const adminLoginSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  })
  .strict();

export const statusPatchSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    version: z.number().int().min(1),
  })
  .strict();

export const paymentPatchSchema = z
  .object({
    paymentStatus: z.enum(['cash_received']),
    version: z.number().int().min(1),
  })
  .strict();

export const availabilityPatchSchema = z
  .object({
    isAvailable: z.boolean(),
    version: z.number().int().min(1),
  })
  .strict();

const productSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only');

const imagePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith('/') || /^https:\/\//i.test(value), {
    message: 'Use a local /path or HTTPS image URL',
  });

const productOptionSchema = z
  .object({
    nameEn: z.string().trim().min(1).max(80),
    nameFil: z.string().trim().min(1).max(80),
    priceCentavos: z.number().int().min(0).max(1_000_000),
  })
  .strict();

const productOptionGroupSchema = z
  .object({
    key: productSlugSchema,
    nameEn: z.string().trim().min(1).max(80),
    nameFil: z.string().trim().min(1).max(80),
    isRequired: z.boolean().default(false),
    minSelect: z.number().int().min(0).max(10),
    maxSelect: z.number().int().min(0).max(10),
    options: z.array(productOptionSchema).min(1).max(12),
  })
  .strict()
  .superRefine((group, ctx) => {
    if (group.minSelect > group.maxSelect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minSelect'],
        message: 'Must not exceed maximum',
      });
    }
    if (group.isRequired && group.minSelect < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minSelect'],
        message: 'Required groups need at least one selection',
      });
    }
    if (group.maxSelect > 0 && group.maxSelect > group.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'Cannot exceed the number of available options',
      });
    }
  });

export const createProductSchema = z
  .object({
    sku: productSlugSchema,
    categoryId: z.string().trim().min(1).max(64),
    name: z.string().trim().min(2).max(120),
    descriptionEn: z.string().trim().min(2).max(500),
    descriptionFil: z.string().trim().min(2).max(500),
    priceCentavos: z.number().int().min(0).max(1_000_000),
    imagePath: imagePathSchema,
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    isPublished: z.boolean().default(false),
    isAvailable: z.boolean().default(false),
    addonIds: z.array(z.string().trim().min(1).max(64)).max(24).default([]),
    optionGroups: z.array(productOptionGroupSchema).max(6).default([]),
  })
  .strict()
  .superRefine((product, ctx) => {
    const keys = product.optionGroups.map((group) => group.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['optionGroups'],
        message: 'Option group keys must be unique',
      });
    }
    if (new Set(product.addonIds).size !== product.addonIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['addonIds'],
        message: 'Add-ons must be selected only once',
      });
    }
    if (!product.isPublished && product.isAvailable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isAvailable'],
        message: 'Draft products cannot be available',
      });
    }
  });

export const publicationPatchSchema = z
  .object({
    isPublished: z.boolean(),
    isAvailable: z.boolean(),
    version: z.number().int().min(1),
  })
  .strict()
  .superRefine((product, ctx) => {
    if (!product.isPublished && product.isAvailable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isAvailable'],
        message: 'Draft products cannot be available',
      });
    }
  });

export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  payment: z.enum(['pending_cash', 'cash_received', 'demo_confirmed']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().max(64).optional(),
});

export const listProductsQuerySchema = z.object({
  search: z.string().max(64).optional(),
  category: z.string().max(64).optional(),
  availability: z.enum(['available', 'sold_out', 'all']).optional(),
});

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const reportQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((range) => range.from <= range.to, {
    path: ['to'],
    message: 'End date must not precede start date',
  });
