import WhatsAppHelpButton from "./WhatsAppHelpButton";

const Layout = ({ children }) => {
  return (
    <div className="app-shell">
      <main className="main-area">
        <header className="top-header">
          <div>HRMS Portal</div>
        </header>

        <section className="page-content">
          {children}
        </section>

        <WhatsAppHelpButton />
      </main>
    </div>
  );
};

export default Layout;