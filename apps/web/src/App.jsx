import { Navigate, Route, Routes } from 'react-router-dom';
import { KioskLayout } from './kiosk/KioskLayout.jsx';
import { WelcomeScreen } from './kiosk/WelcomeScreen.jsx';
import { MenuScreen } from './kiosk/MenuScreen.jsx';
import { CustomizeScreen } from './kiosk/CustomizeScreen.jsx';
import { ReviewScreen } from './kiosk/ReviewScreen.jsx';
import { PaymentScreen } from './kiosk/PaymentScreen.jsx';
import { ConfirmationScreen } from './kiosk/ConfirmationScreen.jsx';
import { AdminLoginScreen } from './admin/AdminLoginScreen.jsx';
import { AdminLayout } from './admin/AdminLayout.jsx';
import { AdminDashboard } from './admin/AdminDashboard.jsx';
import { AdminOrders } from './admin/AdminOrders.jsx';
import { AdminOrderDetail } from './admin/AdminOrderDetail.jsx';
import { AdminMenu } from './admin/AdminMenu.jsx';
import { AdminActivity } from './admin/AdminActivity.jsx';
import { AdminReports } from './admin/AdminReports.jsx';
import { StaffLoginScreen } from './staff/StaffLoginScreen.jsx';
import { StaffShell, StaffLauncher } from './staff/StaffShell.jsx';
import { StationScreen } from './staff/StationScreen.jsx';
import { OrderBoard } from './staff/OrderBoard.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/kiosk" replace />} />
      <Route path="/kiosk" element={<KioskLayout />}>
        <Route index element={<WelcomeScreen />} />
        <Route path="menu" element={<MenuScreen />} />
        <Route path="customize/:productId" element={<CustomizeScreen />} />
        <Route path="review" element={<ReviewScreen />} />
        <Route path="payment" element={<PaymentScreen />} />
        <Route path="confirmation" element={<ConfirmationScreen />} />
      </Route>
      <Route path="/admin/login" element={<AdminLoginScreen />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="orders/:id" element={<AdminOrderDetail />} />
        <Route path="menu" element={<AdminMenu />} />
        <Route path="activity" element={<AdminActivity />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>
      <Route path="/staff/login" element={<StaffLoginScreen />} />
      <Route path="/staff" element={<StaffShell />}>
        <Route index element={<StaffLauncher />} />
        <Route path="cashier" element={<StationScreen station="cashier" />} />
        <Route path="kitchen" element={<StationScreen station="kitchen" />} />
        <Route path="serving" element={<StationScreen station="serving" />} />
      </Route>
      <Route path="/order-board" element={<OrderBoard />} />
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  );
}
