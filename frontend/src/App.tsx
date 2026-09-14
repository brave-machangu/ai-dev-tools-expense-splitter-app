import { Link } from "./components/Link";
import { useRoute } from "./lib/router";
import { GroupPage } from "./pages/GroupPage";
import { HomePage } from "./pages/HomePage";

export function App() {
  const route = useRoute();

  return (
    <div className="app">
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="brand" aria-label="ProRata home">
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            <span className="brand-name">ProRata</span>
          </Link>
          <span className="brand-tagline">
            Split expenses pro rata. Settle up in the fewest payments.
          </span>
        </div>
      </header>

      <main className="container main">
        {route.name === "home" && <HomePage />}
        {route.name === "group" && <GroupPage key={route.code} code={route.code} />}
        {route.name === "not_found" && (
          <section className="card empty-state">
            <h1 className="section-title">Page not found</h1>
            <p className="muted">There's nothing at this address.</p>
            <Link to="/" className="btn btn-primary">
              Go to the start page
            </Link>
          </section>
        )}
      </main>

      <footer className="site-footer container">
        <p className="small muted">
          ProRata records payments — it never moves money. Anyone with a group link can edit it.
        </p>
      </footer>
    </div>
  );
}
