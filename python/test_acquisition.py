import unittest
from unittest.mock import Mock, patch
import server
from serial_bridge import SerialBridge

class AcquisitionTests(unittest.TestCase):
    def test_absent_is_not_zero_and_clears_previous(self):
        server.apply_hardware_telemetry({"FT1":0.0,"FT2":1.5})
        self.assertEqual(server.state["flowSensors"]["FT1"]["flow"],0)
        self.assertIsNone(server.state["flowSensors"]["FT3"]["flow"])
        server.apply_hardware_telemetry({"FT2_RAW":523})
        self.assertIsNone(server.state["flowSensors"]["FT1"]["flow"])
        self.assertEqual(server.state["flowSensors"]["FT2"]["raw"],523)
        self.assertEqual(server.state["flowSensors"]["FT2"]["status"],"uncalibrated")
    def test_parser(self):
        bridge=SerialBridge("unused")
        values=bridge._parse_line("TELEMETRY,FT1=0,FT2=null,FT3_RAW=523,FT4=nan")["values"]
        self.assertEqual(values["FT1"],0)
        self.assertIsNone(values["FT2"])
        self.assertIsNone(values["FT4"])
        self.assertEqual(values["FT3_RAW"],523)
    def test_serial_rejects_actuation(self):
        bridge=SerialBridge("unused"); bridge.connected=True; bridge._serial=Mock()
        for cmd in ["PUMP,P1,1,1", "VALVE,V1,1", "RELAY,X1A,1", "PING\nPUMP,P1,1,1"]:
            self.assertFalse(bridge.send_line(cmd))
        bridge._serial.write.assert_not_called()
        self.assertTrue(bridge.ping())
    def test_hardware_rejects_commands(self):
        with patch.object(server,"BACKEND_MODE","HARDWARE"):
            self.assertFalse(server.handle_command({"type":"pump","id":"P1","power":1}))
    def test_calibration_and_invalid(self):
        with patch.dict(server.FT_ANALOG_CALIBRATION,{"FT2":(100,900,8)}):
            server.apply_hardware_telemetry({"FT2_RAW":500,"FT1":float("inf")})
            self.assertEqual(server.state["flowSensors"]["FT2"]["flow"],4)
            self.assertIsNone(server.state["flowSensors"]["FT1"]["flow"])

if __name__ == "__main__": unittest.main()
