// Roles that may open the dashboard (administrator and board: every section; principal and headmaster/headmistress: their own section).
// The database applies the section limit itself (can_view_dashboard), so this list is only the first gate.
export const DASH_ROLES = ['admin', 'board_member', 'principal', 'headmaster'];
export const canOpenDashboard = (roles) => roles.some((r) => DASH_ROLES.includes(r.role));
