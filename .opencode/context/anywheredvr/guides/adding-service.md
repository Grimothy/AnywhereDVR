<!-- Context: anywheredvr/guides | Priority: medium | Version: 1.0 | Updated: 2026-03-29 -->
# Guide: Adding a Backend Service

**Purpose**: Step-by-step pattern for adding new services to the server package
**Last Updated**: 2026-03-29

## Prerequisites

- Monorepo initialized (Phase 1 complete)
- Prisma schema defined for any models the service needs
- Understanding of existing service patterns (check sibling files)

**Estimated time**: 30-60 min per service

## Steps

### 1. Define Types

Create or update type definitions in `packages/server/src/types/`.

```typescript
// packages/server/src/types/{domain}.ts
export interface MyModel { /* ... */ }
```

**Expected**: Clean type exports, no circular dependencies
**Implementation**: `packages/server/src/types/`

### 2. Create Service File

Add the service in `packages/server/src/services/`.

```typescript
// packages/server/src/services/my-service.ts
import { prisma } from '../db';
import { logger } from '../logger';

export class MyService {
  async doThing(): Promise<Result> {
    logger.info('doing thing');
    // ...
  }
}
```

**Expected**: Uses `pino` logger (not `console.log`), Prisma for DB access
**Implementation**: `packages/server/src/services/`

### 3. Create API Routes (if needed)

Add route file in `packages/server/src/api/`.

```typescript
// packages/server/src/api/my-thing.routes.ts
import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({ /* ... */ });

router.get('/', async (req, res) => {
  // { "data": T, "meta"?: {...} }
});

router.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  // ...
});

export default router;
```

**Expected**: Zod validation on all inputs, standard response format
**Implementation**: `packages/server/src/api/`

### 4. Register Route in Router

Mount the new route in the main router.

```typescript
// packages/server/src/api/router.ts
import myThingRoutes from './my-thing.routes';
router.use('/my-things', myThingRoutes);
```

**Expected**: Route accessible at `/api/v1/my-things`
**Implementation**: `packages/server/src/api/router.ts`

### 5. Initialize in Entry Point

Instantiate the service in the boot sequence.

```typescript
// packages/server/src/index.ts
const myService = new MyService();
```

**Expected**: Service starts with server, available to routes
**Implementation**: `packages/server/src/index.ts`

### 6. Add Socket Events (if real-time needed)

Emit events via SocketManager for live updates.

```typescript
socketManager.emit('my-thing:updated', { id, data });
```

**Expected**: Frontend receives events via `useSocket` hook

### 7. Write Tests

Add Vitest tests alongside the service.

```bash
npm run test
```

**Expected**: Unit tests for service logic, integration tests for API endpoints

## Verification

```bash
npm run dev:server   # Start server
npm run test         # Run tests
npm run lint         # Check style
```

## Conventions Checklist

- [ ] Zod validation on all API inputs
- [ ] `pino` logger (not `console.log`)
- [ ] UTC timestamps in database
- [ ] Standard response format: `{ "data": T }` / `{ "error": { "code", "message" } }`
- [ ] Descriptive names (`isRecordingActive`, not `active()`)
- [ ] Tests written alongside implementation

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Zod validation error | Check request body matches schema |
| Prisma error | Run `npm run db:migrate` after schema changes |
| Route 404 | Verify route is mounted in `router.ts` |

## 📂 Codebase References

**Workflow Orchestration**:
- `packages/server/src/index.ts` - Boot sequence, service initialization
- `packages/server/src/api/router.ts` - Route registration

**Integration Points**:
- `packages/server/src/db.ts` - Prisma client
- `packages/server/src/logger.ts` - Pino logger
- `packages/server/src/services/socket-manager.ts` - Real-time events

## Related

- concepts/architecture.md
- lookup/file-locations.md
- lookup/api-endpoints.md
