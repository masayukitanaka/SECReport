import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { QaPage } from "./pages/QaPage";
import { EvalPage } from "./pages/EvalPage";

function App() {
  return (
    <div style={{ minHeight: "100vh", minWidth: 1024, display: "flex", flexDirection: "column" }}>
      <Header />
      <Routes>
        <Route path="/" element={<QaPage />} />
        <Route path="/admin" element={<EvalPage />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default App;
