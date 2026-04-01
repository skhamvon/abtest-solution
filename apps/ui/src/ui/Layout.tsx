import { Link, Outlet, useLocation } from "react-router-dom";
import "./Layout.css";

export function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="layout-root">
      <header className="layout-header">
        <h1>A/B Testing – Admin</h1>
        <nav>
          <Link
            to="/"
            className={pathname === "/" ? "nav-link active" : "nav-link"}
          >
            Campagnes
          </Link>
          <Link
            to="/segments"
            className={
              pathname.startsWith("/segments") ? "nav-link active" : "nav-link"
            }
          >
            Segments
          </Link>
        </nav>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}

