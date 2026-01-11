# Timeline Scheduler - Hướng Dẫn Sử Dụng

## 📋 Giới Thiệu

**Timeline Scheduler** là ứng dụng quản lý đặt phòng khách sạn theo dạng timeline, được xây dựng bằng React + Vite với DayPilot Scheduler và Ant Design.

---

## 🚀 Cài Đặt & Chạy

```bash
# Cài đặt dependencies
npm install

# Chạy development server
npm run dev

# Build production
npm run build
```

Truy cập: **http://localhost:5173**

---

## 🏗️ Cấu Trúc Dự Án

```
timeline/
├── src/
│   ├── components/
│   │   ├── ReactScheduler.jsx    # Component chính - scheduler
│   │   ├── CurrentTimeIndicator.jsx/css  # Hiển thị đường thời gian hiện tại
│   ├── assets/
│   │   ├── themes/light.css      # Theme scheduler
│   │   ├── toolbar.css           # Style toolbar
│   │   ├── modal.css             # Style modal
│   ├── App.jsx                   # Entry component
│   └── main.jsx                  # React entry point
├── package.json
└── vite.config.js
```

---

## 📦 Dependencies Chính

| Package | Mục đích |
|---------|----------|
| `@daypilot/daypilot-lite-react` | Scheduler timeline component |
| `antd` | UI components (Button, Modal, Checkbox...) |
| `@ant-design/icons` | Icons |
| `dayjs` | Date manipulation |

---

## ✨ Tính Năng

### 1. Chế Độ Xem (View Modes)

| Nút | Mô tả | Scale |
|-----|-------|-------|
| **Ngày** | Xem 1 ngày, chia theo giờ (0-23) | CellDuration |
| **Tuần** | Xem 7 ngày | CellDuration |
| **Tháng** | Xem cả tháng | CellDuration |

### 2. Checkbox "Xem ngày"

- ❌ **Unchecked**: Events hiển thị theo giờ thực tế (check-in 13h, check-out 11h)
- ✅ **Checked**: Events snap vào full ngày (tổng quan)

### 3. Quản Lý Booking

- **Tạo mới**: Click vào ô trống trên timeline
- **Chỉnh sửa**: Click vào event → Modal edit
- **Di chuyển**: Kéo thả event sang phòng/ngày khác
- **Resize**: Kéo cạnh event để thay đổi thời gian

### 4. Phân Loại Phòng (Categories)

Phòng được nhóm theo loại (Studio, Premium, Luxury...) với khả năng:
- Click vào category để **thu gọn/mở rộng**
- Mỗi category có màu riêng

### 5. Booking Chưa Gán Phòng

- Badge đỏ hiển thị số lượng booking chưa gán trên header ngày
- Click badge để mở popup gán phòng

### 6. Legend (Chú thích màu)

| Màu | Trạng thái |
|-----|------------|
| 🟡 Vàng | Đã đặt |
| 🟢 Xanh lá | Có khách |
| 🔵 Xanh dương | Chưa đến |
| 🔴 Đỏ | Chưa đi |
| 🟣 Tím | Đã trả |
| 🟠 Cam | Bán |
| ⬜ Xám | Sửa |

---

## 🔧 Cấu Hình Chính

### Thời gian mặc định
- **Check-in**: 13:00
- **Check-out**: 11:00
- **Cell duration**: 60 phút (1 giờ = 1 cell)

### Logic "Xem ngày" snap
- Checkout **<= 12:00**: Event kết thúc tại ngày checkout
- Checkout **> 12:00**: Event bao gồm ngày checkout

---

## 📝 Các Functions Chính

| Function | Mô tả |
|----------|-------|
| `changeViewMode(mode)` | Chuyển đổi Day/Week/Month |
| `displayEvents` | Transform events khi check "Xem ngày" |
| `onTimeRangeSelected` | Tạo booking mới |
| `openEditModal` | Mở modal chỉnh sửa |
| `onBeforeEventRender` | Customize hiển thị event |
| `onBeforeRowHeaderRender` | Style category headers |
| `onBeforeTimeHeaderRender` | Thêm badge booking chưa gán |
| `handleResize` | Tính cellWidth theo kích thước màn hình |
| `scrollToToday` | Scroll đến ngày hôm nay |

---

## 🎨 Tùy Chỉnh

### Thay đổi màu event
Sửa trong `onBeforeEventRender` hoặc trực tiếp trong data:
```javascript
{ backColor: "#f0c000", ... }
```

### Thay đổi format header
Sửa trong `timeHeaders`:
```javascript
{ groupBy: "Day", format: "dddd dd/MM" }
{ groupBy: "Hour", format: "H" }
```

---

## 📞 Hỗ Trợ

Dự án được phát triển dựa trên giao diện **EzCloudHotel PMS Timeline**.
