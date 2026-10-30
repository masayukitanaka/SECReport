import { Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { LandingPage } from "./pages/LandingPage";
import { QaPage } from "./pages/QaPage";
import { EvalPage } from "./pages/EvalPage";
import { TickerAdminPage } from "./pages/TickerAdminPage";

function App() {
  return (
    <div style={{ minHeight: "100vh", minWidth: 1024, display: "flex", flexDirection: "column" }}>
      <Header />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <QaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/eval" replace />} />
          <Route path="eval" element={<EvalPage />} />
          <Route path="ticker" element={<TickerAdminPage />} />
        </Route>
      </Routes>
      <Footer />
    </div>
  );
}

export default App;
