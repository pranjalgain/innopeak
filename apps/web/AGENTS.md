# Project Instructions

## Project Conventions (CRITICAL)

### File and Folder Naming

**CRITICAL:** All files and folders MUST use kebab-case naming.

- Use descriptive, hyphenated names
- Include the file type in the name when helpful: `.test.ts`, `.spec.ts`, `.config.ts`
- For components, match the folder name: `user-profile/user-profile.tsx`

**Correct:**

```
components/user-profile.tsx
pages/order-history/
utils/string-helpers.ts
hooks/use-local-storage.ts
```

**Incorrect:**

```
❌ UserProfile.tsx
❌ dataTable.tsx
❌ order_history/
❌ stringHelpers.ts
```

### Path Aliases

Always use configured path aliases for cleaner imports:

- `@/*` → `./src/*`
- `@/components/*` → `./src/components/*`
- `@/app/*` → `./src/app/*`

```tsx
// ✅ Use path aliases
import { Button } from "@/components/ui/button";
import { cn } from "@/app/_libs/utils/cn";
import { UserService } from "@/app/_libs/services/user.service";

// ❌ Don't use relative imports for distant files
import { Button } from "../../../components/ui/button";
```

### Colocation Patterns

- Keep related components close to where they're used
- Use `_components` for app-wide shared components
- Place page-specific components in the same directory as the page

### Private Folders

- `_components/` - Shared components
- `_libs/` - Utilities and libraries
- `_config/` - Configuration files
- `_types/` - Type definitions

### Documentation

- Use JSDoc for function and class documentation
- Explain why, not what
- Include examples for complex functions
- Use clear section headings with emojis
- Include code examples with proper syntax highlighting
- Provide both quick start and detailed instructions

### Environment Management

- Use `.env` for local development
- Use `.env.example` for environment template
- Never commit actual environment values

## TypeScript Strict Rules

### Type Safety Principles

- Use strict TypeScript configuration as defined in tsconfig.json
- No implicit any types allowed
- Prefer explicit type definitions over type inference when clarity is needed
- Use proper type guards and assertions

### Interface Patterns

- Use PascalCase for interface names
- Prefer interfaces for object shapes that might be extended
- Use descriptive names that indicate purpose

```tsx
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}
```

### Type Patterns

- Use type aliases for union types, primitive aliases, and complex computations
- Use utility types when appropriate (Omit, Pick, Partial, etc.)

```tsx
type Status = "pending" | "completed" | "failed";
type CreateUserData = Omit<User, "id" | "createdAt">;
```

### Component Props

- Always type component props explicitly
- Use proper TypeScript patterns for children, events, and refs
- Leverage React built-in types

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline";
  children: React.ReactNode;
}
```

### API Response Types

- Define clear types for API responses
- Use discriminated unions for success/error states
- Type query parameters and request bodies

### Zod Integration

- Use Zod for runtime type validation
- Infer TypeScript types from Zod schemas
- Validate environment variables and API inputs

```tsx
const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
});
type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

### Environment Variables

- Use @t3-oss/env-nextjs for type-safe environment variables
- Define client and server environment variables separately
- Use Zod for validation

## UI Component Architecture

### CVA Pattern (Critical)

Use Class Variance Authority (CVA) for component variants:

```tsx
import { type VariantProps, cva } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border bg-background hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
```

### Polymorphic Components (asChild Pattern)

Use the `asChild` prop for polymorphic behavior:

```tsx
import { Slot } from "@radix-ui/react-slot";

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
```

### Radix UI Integration

- Always use Radix UI primitives for complex interactive components
- Preserve Radix's accessibility features
- Add proper ARIA labels and descriptions
- Test with keyboard navigation

```tsx
import * as DialogPrimitive from "@radix-ui/react-dialog";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Content
    ref={ref}
    className={cn(
      "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200",
      className,
    )}
    {...props}>
    {children}
  </DialogPrimitive.Content>
));
```

## Next.js 15 App Router

### Directory Structure

- Use the `src/app/` directory for all routing and layout files
- Follow Next.js 15 App Router conventions with page.tsx, layout.tsx, loading.tsx, error.tsx
- Use route groups with parentheses for organization: `(public)`, `(private)`
- Place shared components in `src/app/_components/`
- Place configuration in `src/app/_config/`
- Place utilities and services in `src/app/_libs/`

### File Conventions

- Always export default function for pages and layouts
- Use descriptive function names that match the file purpose
- Include TypeScript types for all props
- Use proper metadata exports

### Dynamic Routes

- Use bracket notation for dynamic segments: `[id]`, `[slug]`
- Use spread syntax for catch-all routes: `[...slug]`
- Access params through the `params` prop in server components

### Route Groups

- Use parentheses for route groups that don't affect URL structure
- Group related routes logically: `(auth)`, `(dashboard)`, `(public)`
- Each group can have its own layout.tsx

### Server vs Client Components

- Keep components as server components by default
- Use for data fetching, database queries, static content
- No useState, useEffect, or browser APIs
- Add `"use client"` directive at the top when needed
- Use for interactivity, hooks, browser APIs, event handlers
- Minimize client components to improve performance

### Data Fetching

- Use async/await directly in server components
- Fetch data as close to where it's used as possible
- Use proper error handling with try/catch
- Use loading.tsx for loading states
- Use error.tsx for error boundaries
- Use not-found.tsx for 404 pages

### Image and Font Optimization

- Always use `next/image` instead of `<img>`
- Provide width and height or use fill
- Use appropriate loading strategies
- Use `next/font` for Google Fonts and local fonts
- Define fonts in configuration files
- Use CSS variables for font application

### Performance Features

- Development server runs with Turbopack by default
- Faster builds and hot reloading
- Better error messages and debugging
- Enhanced with React 19 features
- Improved Server Components
- Better hydration and rendering

### Type Safety

- Use generated route types for type safety
- Import from `next/navigation` with proper typing
- Run `next typegen` to generate route types

## Tailwind CSS Styling

### CN Utility (Critical)

Always use the `cn()` utility for combining classes:

```tsx
import { cn } from "@/app/_libs/utils/cn";

// ✅ Use cn() for class merging
<div
  className={cn(
    "base-classes",
    variant === "primary" && "bg-blue-500",
    size === "large" && "p-4",
    className, // Allow override
  )}
/>;
```

### Dark Mode Implementation

Use semantic color classes that adapt to dark mode:

```tsx
// ✅ Semantic colors that adapt
<div className="bg-background text-foreground border-border">
  <h1 className="text-primary">Title</h1>
  <p className="text-muted-foreground">Description</p>
</div>
```

### Mobile-First Responsive Design

Always design for mobile first, then scale up:

```tsx
<div className={cn(
  "flex flex-col gap-4 p-4", // Mobile first
  "md:flex-row md:gap-6 md:p-6", // Tablet
  "lg:gap-8 lg:p-8", // Desktop
  "xl:max-w-6xl xl:mx-auto" // Large screens
)}>
```

## Form Patterns

### React Hook Form + Zod

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const userFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type UserFormData = z.infer<typeof userFormSchema>;

export function UserForm() {
  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

## Custom Hooks (Essential Patterns)

### Mobile Detection Hook

```tsx
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
```

### Local Storage Hook

```tsx
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}
```

## Error Handling

### Error Boundary Pattern

```tsx
// error.tsx
"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error("Page error:", error), [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
      <h2 className="text-2xl font-semibold">Something went wrong!</h2>
      <Button onClick={reset}>Try Again</Button>
    </div>
  );
}
```

## Testing Essentials

### Component Testing

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("should handle click events", async () => {
  const user = userEvent.setup();
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  await user.click(screen.getByRole("button"));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
```

## Accessibility Essentials

- Use semantic HTML elements first: `<button>`, `<nav>`, `<main>`
- Provide `aria-label` for icon buttons: `<button aria-label="Delete user">`
- Include focus indicators: `focus:ring-2 focus:ring-ring focus:ring-offset-2`

## Key Utilities

```tsx
// Class name utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Type guards
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
```

---

## Anti-Patterns to Avoid

- Don't use PascalCase, camelCase, or snake_case for files/folders
- Don't use `any` type
- Don't use `unknown` without type guards
- Don't ignore TypeScript errors with @ts-ignore
- Don't use assertion (`as`) unless absolutely necessary
- Don't define types inline in multiple places (extract to interfaces)
- Don't use relative imports for distant files
- Don't place business logic in components
- Don't ignore the colocation patterns
- Don't create deeply nested folder structures
- Don't mix naming conventions within the project
- Don't commit environment files with secrets
- Don't skip forwardRef for reusable components
- Don't use hardcoded colors instead of semantic classes
- Don't ignore mobile-first responsive design
- Don't use `<img>` instead of `next/image`
- Don't forget "use client" for interactive components
- Don't test implementation details
- Don't write tests that don't test anything meaningful
- Don't forget to clean up after tests
- Don't use generic test descriptions

## Best Practices

- Use kebab-case for all files and folders
- Use strict TypeScript configuration
- Define types close to where they're used
- Use utility types for type transformations
- Leverage type inference where it improves readability
- Use branded types for domain-specific values
- Validate external data with Zod
- Use discriminated unions for state management
- Use strict TypeScript with proper interfaces
- Use CVA for all component variants
- Implement polymorphic behavior with asChild
- Leverage Radix UI primitives for complex components
- Use cn() utility for className merging
- Follow mobile-first responsive design
- Use semantic color variables for dark mode
- Follow AAA pattern (Arrange, Act, Assert)
- Use descriptive test names
- Test behavior, not implementation
- Mock external dependencies
- Use proper test data factories
- Test both happy path and error cases
- Keep tests isolated and independent
- Use semantic queries (getByRole, getByLabelText)
- Test component behavior and accessibility
