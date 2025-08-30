import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.tsx";
import { AuthPage } from "./pages/AuthPage.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import ProfilePage from "./pages/ProfilePage";
import "./index.css";
import EditProfilePage from "./pages/EditProfilePage";

const router = createBrowserRouter([
  { path: "/", element: <AuthPage mode="signin" /> },
  { path: "/signup", element: <AuthPage mode="signup" /> },
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/test", element: <App /> },
  { path: "/profile/:username", element: <ProfilePage /> },
  { path: "/profile/:username/edit", element: <EditProfilePage /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
