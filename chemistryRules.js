// Map solution + nailType → plating type
// solution: 'AGNO3' | 'CUSO4' | 'FESO4' | ...
// nailType: 'steel' | 'copper'

export function resolvePlating({ solution, nailType }) {
  const sol = String(solution || '').toUpperCase();
  const type = String(nailType || 'steel').toLowerCase();

  if (sol === 'AGNO3') {
    // Both steel and copper nails get silver plating in AgNO3
    return 'silver';
  }
  if (sol === 'CUSO4') {
    // Only steel nail plates with copper in CuSO4; copper nail does not plate
    return type === 'steel' ? 'copper' : 'none';
  }
  // FeSO4 and others: no plating
  return 'none';
}
