'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { staffIdentity } from '@/lib/security/staff'
import { audit } from '@/lib/security/audit'

export type MfaState = { error?: string; factorId?: string; uri?: string } | undefined

export async function prepareMfa(): Promise<MfaState> {
  const identity = await staffIdentity()
  if (!identity) return { error: 'Vuelve a iniciar sesión.' }
  const { supabase } = identity
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return { error: 'No se pudo preparar la verificación.' }
  const verified = data.totp.find((factor) => factor.status === 'verified')
  if (verified) return { factorId: verified.id }
  // Re-enrol only this user's unfinished factor, on explicit action, never during GET.
  for (const factor of data.all.filter((factor) => factor.status === 'unverified' && factor.factor_type === 'totp')) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return { error: 'No se pudo preparar la verificación.' }
  }
  const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'FastPass' })
  if (enrolled.error) return { error: 'No se pudo preparar la verificación.' }
  return { factorId: enrolled.data.id, uri: enrolled.data.totp.uri }
}

export async function verifyMfa(_previous: MfaState, formData: FormData): Promise<MfaState> {
  const parsed = z.object({ factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Introduce el código de seis dígitos.' }
  const identity = await staffIdentity()
  if (!identity) return { error: 'Vuelve a iniciar sesión.' }
  const { supabase } = identity
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError || !factors.all.some((f) => f.id === parsed.data.factorId && f.factor_type === 'totp')) {
    audit('mfa_failed'); return { error: 'Verificación no válida.' }
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data)
  if (error) { audit('mfa_failed'); return { error: 'Código incorrecto o caducado.' } }
  const { data: role } = await supabase.rpc('staff_role')
  if (!role) return { error: 'No autorizado.' }
  redirect(role === 'controller' ? '/admin/validar' : '/admin')
}
