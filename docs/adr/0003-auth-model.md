# ADR-0003: Guest and Logged-In Authentication Model

## Title
Support both guest and logged-in users via Supabase Auth

## Date
2026-02-04

## Status
Accepted

## Context
The booking flow must support two user types:

1. **Guest users**: Browse hotels and create bookings without creating an account
2. **Logged-in users**: Have a Supabase account for order history, saved preferences, etc.

### Requirements
- **Public search**: Anyone can search hotels (no auth required for search-hotels endpoint)
- **Booking creation**: Requires some form of authentication to prevent abuse and link bookings to users
- **Unified model**: Both guest and logged-in users should use the same booking flow

## Decision
**Use Supabase Auth with anonymous sign-in for guests**

### Authentication Flow

#### Guest Users
1. **Frontend**: Call Supabase `signInAnonymously()` when user starts booking flow (after search)
2. **Supabase**: Creates a temporary anonymous user with a JWT
3. **Frontend**: Use anonymous user's JWT for create-booking API call
4. **Backend**: Booking is associated with anonymous user ID
5. **Optional**: Later convert anonymous user to full account via `linkIdentity()` if they sign up

#### Logged-In Users
1. **Frontend**: User signs in with email/password (or OAuth)
2. **Supabase**: Issues JWT for authenticated user
3. **Frontend**: Use authenticated user's JWT for create-booking API call
4. **Backend**: Booking is associated with authenticated user ID

### Database Schema
```sql
-- bookings table links to auth.users (both anonymous and authenticated)
CREATE TABLE mygo_bookings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  is_anonymous BOOLEAN DEFAULT FALSE,
  -- ... other fields
);
```

### Row-Level Security (RLS)
```sql
-- Users can only read their own bookings
CREATE POLICY "Users can view own bookings" ON mygo_bookings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert bookings for themselves
CREATE POLICY "Users can create own bookings" ON mygo_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## Consequences

### Positive
- ✅ **Unified auth model**: Both guest and logged-in use JWTs (no special-case logic)
- ✅ **Supabase built-in**: Leverages Supabase's anonymous auth (no custom implementation)
- ✅ **Abuse prevention**: Even guests have a JWT, enabling rate limiting and audit trails per user
- ✅ **Easy upgrade path**: Anonymous users can upgrade to full accounts without data migration
- ✅ **RLS enforcement**: All bookings protected by RLS policies automatically

### Negative
- ❌ **Frontend complexity**: Frontend must handle anonymous sign-in flow
- ❌ **Session management**: Anonymous sessions expire (requires re-authentication after expiry)
- ❌ **DB growth**: Anonymous users create entries in auth.users table (requires cleanup)

### Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Anonymous user table bloat | Periodic cleanup of expired anonymous users (Supabase background job) |
| Anonymous session expiry during booking | Frontend catches auth errors and re-authenticates transparently |
| Guest user confusion | Clear UX: "Continue as guest" vs "Sign in" |
| Leaked anonymous JWTs | Short expiry times (1 hour); rate limiting by user ID |

### Implementation Notes
- **Frontend**: Use `supabase.auth.signInAnonymously()` before navigating to booking page
- **Frontend**: Handle `PGRST301` (JWT expired) by re-authenticating
- **Backend**: Accept any valid JWT (anonymous or authenticated) for create-booking
- **Backend**: Set `is_anonymous = true` when creating booking if user is anonymous
- **Admin**: Periodic cleanup of anonymous users inactive for >7 days

### Future Enhancements
- Email capture during guest booking (optional) to enable order tracking link
- Prompt guest users to create account after successful booking
- Merge guest bookings into account when user signs up with same email
