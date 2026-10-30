import { asyncHandler, ApiError } from '../lib/utils.js'
import { userCreateSchema, userUpdateSchema } from '../lib/validators.js'

export function buildUsersController(ctx) {
  const { store, mode, supabase } = ctx

  const list = asyncHandler(async (req, res) => {
    const rows = await store.profiles.listProfiles({ search: req.query.search || undefined })
    res.json({ rows })
  })

  const create = asyncHandler(async (req, res) => {
    const data = userCreateSchema.parse(req.body)
    const existing = await store.profiles.getProfileByEmail(data.email)
    if (existing) throw new ApiError(409, 'A user with this email already exists')

    if (mode === 'supabase') {
      // Create the Supabase Auth account first (trusted, server-side); the
      // on_auth_user_created trigger writes the initial profile row.
      // Response shape: { data: { user: {...} }, error } — the user object is
      // nested under data.user (reading data.id here was undefined → null-id
      // insert → 23502).
      const { data: { user: authUser }, error } = await supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name }
      })
      if (error) throw new ApiError(400, `Could not create the account: ${error.message}`)
      const profile = await store.profiles.createProfile({
        id: authUser.id,
        full_name: data.full_name,
        email: data.email,
        role: data.role,
        is_active: true
      })
      res.status(201).json({ user: profile })
      return
    }

    const profile = await store.profiles.createProfile({
      full_name: data.full_name,
      email: data.email,
      role: data.role,
      is_active: true,
      password: data.password
    })
    res.status(201).json({ user: profile })
  })

  const update = asyncHandler(async (req, res) => {
    const data = userUpdateSchema.parse(req.body)
    const target = await store.profiles.getProfile(req.params.id)
    if (!target) throw new ApiError(404, 'User not found')

    if (target.id === req.user.id && (data.role !== undefined || data.is_active === false)) {
      throw new ApiError(400, 'You cannot change your own role or deactivate your own account')
    }
    const user = await store.profiles.updateProfile(target.id, data)
    res.json({ user })
  })

  return { list, create, update }
}
