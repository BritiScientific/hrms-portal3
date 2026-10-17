const pool = require("../config/db");

const getNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, body, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Unable to fetch notifications" });
  }
};

const markRead = async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = $1 AND user_id = $2 RETURNING id, read_at",
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Notification not found" });
    return res.json({ message: "Notification marked read", notification: result.rows[0] });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ message: "Unable to update notification" });
  }
};

module.exports = { getNotifications, markRead };
