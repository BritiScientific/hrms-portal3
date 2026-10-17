import {
  CalendarDays,
  FileText,
  MessageCircle,
  UserRound,
  WalletCards
} from "lucide-react";

const EmployeeDashboard = () => {
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="breadcrumb">
            Employee Portal / Dashboard
          </p>

          <h1>Welcome back 👋</h1>

          <span>
            View your attendance, leave, documents, and HR support.
          </span>
        </div>
      </div>

      <div className="employee-card-grid">
        <article className="employee-feature-card blue-card">
          <CalendarDays size={28} />
          <h3>My attendance</h3>
          <p>View daily punches and monthly attendance.</p>
          <button>View attendance</button>
        </article>

        <article className="employee-feature-card green-card">
          <FileText size={28} />
          <h3>My leave</h3>
          <p>Apply for leave and check approval status.</p>
          <button>Apply leave</button>
        </article>

        <article className="employee-feature-card purple-card">
          <WalletCards size={28} />
          <h3>My payslips</h3>
          <p>View and download available payslips.</p>
          <button>View payslips</button>
        </article>

        <article className="employee-feature-card pink-card">
          <MessageCircle size={28} />
          <h3>HR help</h3>
          <p>Contact HR directly through WhatsApp.</p>
          <button>Open WhatsApp</button>
        </article>
      </div>

      <div className="employee-quick-links">
        <button>
          <UserRound size={18} />
          My profile
        </button>

        <button>
          <FileText size={18} />
          My documents
        </button>

        <button>
          <MessageCircle size={18} />
          HR help desk
        </button>
      </div>
    </div>
  );
};

export default EmployeeDashboard;