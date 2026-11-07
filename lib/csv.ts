export function csvCell(value: unknown) {
  const raw=String(value??'')
  const safe=/^[\s]*[=+@\-\t\r\n]/.test(raw)?`'${raw}`:raw
  return `"${safe.replace(/"/g,'""')}"`
}
