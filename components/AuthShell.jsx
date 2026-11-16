import ThemeToggle from './ThemeToggle';
// One centred card on a soft gradient (phone-first). The card itself is drawn by the page (see .login-card).
export default function AuthShell({ children }) {
  return (
    <div className="auth auth-center">
      <ThemeToggle />
      <div className="auth-stage">{children}</div>
    </div>
  );
}
