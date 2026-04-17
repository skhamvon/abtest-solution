import { Link, NavLink, Outlet } from "react-router-dom";
import { useTheme } from "@/theme/ThemeContext";
import "./Layout.css";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      className="theme-toggle"
      data-theme={theme}
      onClick={toggleTheme}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Passer en thème sombre" : "Passer en thème clair"}
      title={isLight ? "Thème sombre" : "Thème clair"}
    >
      <span className="theme-toggle__icon" aria-hidden>
        <span>◐</span>
        <span>☀</span>
      </span>
      <span className="theme-toggle__thumb" />
    </button>
  );
}

function SidebarNav() {
  return (
    <aside className="layout-sidebar">
      <nav
        className="layout-sidebar__nav"
        aria-label="Navigation latérale"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? "sidebar-link active" : "sidebar-link"
          }
        >
          Accueil
        </NavLink>
        <NavLink
          to="/campaigns"
          className={({ isActive }) =>
            isActive ? "sidebar-link active" : "sidebar-link"
          }
        >
          Campagnes
        </NavLink>
        <NavLink
          to="/segments"
          className={({ isActive }) =>
            isActive ? "sidebar-link active" : "sidebar-link"
          }
        >
          Segments
        </NavLink>
        <NavLink
          to="/configuration"
          className={({ isActive }) =>
            isActive ? "sidebar-link active" : "sidebar-link"
          }
        >
          Configuration
        </NavLink>
      </nav>
    </aside>
  );
}

export function Layout() {
  return (
    <div className="layout-root">
      <header className="layout-header">
        <div className="layout-header__brand">
          <Link
            to="/"
            className="layout-header__logo-link"
            title="Accueil"
            aria-label="Accueil"
          >
            <div className="layout-header__logo" aria-hidden>
              A
            </div>
          </Link>
          <h1>
            <span className="layout-header__title-gradient">A/B Testing</span>
            <span style={{ opacity: 0.92 }}> — Admin</span>
          </h1>
        </div>
        <div className="layout-header__actions">
          <ThemeToggle />
        </div>
      </header>
      <div className="layout-body">
        <SidebarNav />
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
