//+------------------------------------------------------------------+
//|                                                  NexusBridge.mq5 |
//|                     Nexus Trade — Python ↔ MT5 Socket Bridge     |
//|                                                                  |
//|  Attach to any chart. Communicates with the Python backend via   |
//|  TCP sockets (JSON, newline-delimited).                          |
//+------------------------------------------------------------------+
#property copyright "Nexus Trade"
#property version   "2.01"
#property strict
//--- v2.00: candle streaming (get_candles) for real-time Python analytics
//---        + open_trade alias used by the agentic auto-trader
//--- v2.01: compile fix — SendRaw/SendCandles now take strings by value,
//---        so temporaries (string concatenations) are accepted and no
//---        const parameter is ever assigned to.

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>

//--- inputs
input string InpHost       = "127.0.0.1";  // Python bridge host
input int    InpPort       = 5555;         // Python bridge port
input int    InpMagic      = 20250910;     // Magic number
input int    InpHeartbeat  = 2;            // Heartbeat interval (seconds)
input bool   InpVerbose    = true;         // Verbose logging

//--- globals
int      g_socket = INVALID_HANDLE;
bool     g_connected = false;
datetime g_lastHeartbeat = 0;
CTrade   g_trade;
CPositionInfo g_pos;
CAccountInfo  g_account;

//+------------------------------------------------------------------+
int OnInit()
{
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(20);
   g_trade.SetTypeFilling(ORDER_FILLING_IOC);

   EventSetTimer(1);
   Print("NexusBridge starting — connecting to ", InpHost, ":", InpPort);
   ConnectToPython();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Disconnect();
}

//+------------------------------------------------------------------+
void OnTimer()
{
   if(!g_connected)
   {
      static datetime lastTry = 0;
      if(TimeCurrent() - lastTry >= 5)
      {
         lastTry = TimeCurrent();
         ConnectToPython();
      }
      return;
   }

   // Read any incoming commands
   ReadCommands();

   // Periodic account + positions push
   if(TimeCurrent() - g_lastHeartbeat >= InpHeartbeat)
   {
      g_lastHeartbeat = TimeCurrent();
      SendHeartbeat();
      SendAccount();
      SendPositions();
   }
}

//+------------------------------------------------------------------+
//| Socket helpers                                                    |
//+------------------------------------------------------------------+
bool ConnectToPython()
{
   if(g_socket != INVALID_HANDLE)
      SocketClose(g_socket);

   g_socket = SocketCreate();
   if(g_socket == INVALID_HANDLE)
   {
      Print("SocketCreate failed: ", GetLastError());
      g_connected = false;
      return false;
   }

   if(!SocketConnect(g_socket, InpHost, InpPort, 3000))
   {
      if(InpVerbose) Print("Connect failed to ", InpHost, ":", InpPort, " err=", GetLastError());
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
      g_connected = false;
      return false;
   }

   g_connected = true;
   Print("Connected to Python bridge ", InpHost, ":", InpPort);
   SendLog("EA connected");
   return true;
}

void Disconnect()
{
   if(g_socket != INVALID_HANDLE)
   {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
   }
   g_connected = false;
}

bool SendRaw(string msg)
{
   if(!g_connected || g_socket == INVALID_HANDLE) return false;
   string payload = msg + "\n";
   uchar data[];
   int len = StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if(len <= 0) return false;
   int sent = SocketSend(g_socket, data, len);
   if(sent <= 0)
   {
      Print("SocketSend failed, disconnecting");
      Disconnect();
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
void SendHeartbeat()
{
   SendRaw("{\"type\":\"heartbeat\",\"ts\":" + IntegerToString((int)TimeCurrent()) + "}");
}

void SendLog(const string msg)
{
   string json = "{\"type\":\"log\",\"message\":\"" + EscapeJson(msg) + "\"}";
   SendRaw(json);
}

void SendAccount()
{
   string json = StringFormat(
      "{\"type\":\"account\",\"data\":{"
      "\"balance\":%.2f,"
      "\"equity\":%.2f,"
      "\"margin\":%.2f,"
      "\"free_margin\":%.2f,"
      "\"margin_level\":%.2f,"
      "\"profit\":%.2f,"
      "\"currency\":\"%s\","
      "\"leverage\":%d"
      "}}",
      g_account.Balance(),
      g_account.Equity(),
      g_account.Margin(),
      g_account.FreeMargin(),
      g_account.MarginLevel(),
      g_account.Profit(),
      g_account.Currency(),
      (int)g_account.Leverage()
   );
   SendRaw(json);
}

void SendPositions()
{
   string arr = "";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      if(!g_pos.SelectByIndex(i)) continue;
      if(g_pos.Magic() != InpMagic && InpMagic != 0) continue;

      if(StringLen(arr) > 0) arr += ",";
      string typeStr = (g_pos.PositionType() == POSITION_TYPE_BUY) ? "buy" : "sell";
      arr += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
         "\"open_price\":%.5f,\"current_price\":%.5f,\"sl\":%.5f,\"tp\":%.5f,"
         "\"profit\":%.2f,\"open_time\":\"%s\"}",
         (int)g_pos.Ticket(),
         g_pos.Symbol(),
         typeStr,
         g_pos.Volume(),
         g_pos.PriceOpen(),
         g_pos.PriceCurrent(),
         g_pos.StopLoss(),
         g_pos.TakeProfit(),
         g_pos.Profit(),
         TimeToString(g_pos.Time(), TIME_DATE|TIME_SECONDS)
      );
   }
   string json = "{\"type\":\"positions\",\"data\":[" + arr + "]}";
   SendRaw(json);
}

//+------------------------------------------------------------------+
//| Read & process commands from Python                               |
//+------------------------------------------------------------------+
void ReadCommands()
{
   if(!g_connected || g_socket == INVALID_HANDLE) return;

   uint available = SocketIsReadable(g_socket);
   if(available == 0) return;

   uchar buffer[];
   ArrayResize(buffer, (int)available);
   int received = SocketRead(g_socket, buffer, available, 100);
   if(received <= 0)
   {
      if(received < 0)
      {
         Print("SocketRead error, disconnecting");
         Disconnect();
      }
      return;
   }

   string raw = CharArrayToString(buffer, 0, received, CP_UTF8);
   string lines[];
   int n = StringSplit(raw, '\n', lines);
   for(int i = 0; i < n; i++)
   {
      string line = lines[i];
      StringTrimLeft(line);
      StringTrimRight(line);
      if(StringLen(line) < 5) continue;
      ProcessCommand(line);
   }
}

void ProcessCommand(const string &json)
{
   string type = JsonStr(json, "type");
   if(type != "command") return;

   string cmd = JsonStr(json, "command");
   if(InpVerbose) Print("Command received: ", cmd);

   if(cmd == "open_order" || cmd == "open_trade")
   {
      string symbol    = JsonStr(json, "symbol");
      string direction = JsonStr(json, "direction");
      double volume    = JsonDbl(json, "volume");
      double sl        = JsonDbl(json, "sl");
      double tp        = JsonDbl(json, "tp");
      if(volume <= 0) volume = 0.01;

      bool ok = false;
      if(direction == "buy")
         ok = g_trade.Buy(volume, symbol, 0, sl, tp, "Nexus");
      else if(direction == "sell")
         ok = g_trade.Sell(volume, symbol, 0, sl, tp, "Nexus");

      string result = ok
         ? StringFormat("{\"ok\":true,\"ticket\":%d,\"symbol\":\"%s\"}", (int)g_trade.ResultOrder(), symbol)
         : StringFormat("{\"ok\":false,\"error\":\"%s\"}", g_trade.ResultRetcodeDescription());
      SendRaw("{\"type\":\"order_result\",\"data\":" + result + "}");
      SendLog("Order " + direction + " " + symbol + " → " + (ok ? "OK" : "FAIL"));
   }
   else if(cmd == "close_order")
   {
      long ticket = (long)JsonDbl(json, "ticket");
      bool ok = false;
      if(g_pos.SelectByTicket(ticket))
         ok = g_trade.PositionClose(ticket);
      SendRaw(StringFormat("{\"type\":\"order_result\",\"data\":{\"ok\":%s}}", ok ? "true" : "false"));
      SendLog(StringFormat("Close ticket %I64d → %s", ticket, ok ? "OK" : "FAIL"));
   }
   else if(cmd == "close_all")
   {
      int closed = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(!g_pos.SelectByIndex(i)) continue;
         if(g_pos.Magic() != InpMagic && InpMagic != 0) continue;
         if(g_trade.PositionClose(g_pos.Ticket())) closed++;
      }
      SendRaw(StringFormat("{\"type\":\"order_result\",\"data\":{\"ok\":true,\"closed\":%d}}", closed));
      SendLog(StringFormat("Closed %d positions", closed));
   }
   else if(cmd == "get_candles")
   {
      string symbol   = JsonStr(json, "symbol");
      string tfStr    = JsonStr(json, "timeframe");
      int    bars     = (int)JsonDbl(json, "bars");
      if(bars <= 0 || bars > 1000) bars = 300;
      SendCandles(symbol, TfFromString(tfStr), bars);
   }
}

//+------------------------------------------------------------------+
//| Timeframe helper                                                  |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES TfFromString(const string tf)
{
   if(tf == "M1")  return PERIOD_M1;
   if(tf == "M5")  return PERIOD_M5;
   if(tf == "M15") return PERIOD_M15;
   if(tf == "M30") return PERIOD_M30;
   if(tf == "H4")  return PERIOD_H4;
   if(tf == "D1")  return PERIOD_D1;
   if(tf == "W1")  return PERIOD_W1;
   return PERIOD_H1;
}

string TfToString(ENUM_TIMEFRAMES tf)
{
   switch(tf)
   {
      case PERIOD_M1:  return "M1";
      case PERIOD_M5:  return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_M30: return "M30";
      case PERIOD_H4:  return "H4";
      case PERIOD_D1:  return "D1";
      case PERIOD_W1:  return "W1";
      default:         return "H1";
   }
}

//+------------------------------------------------------------------+
//| Stream OHLCV candle history to Python (newline-delimited JSON)    |
//+------------------------------------------------------------------+
void SendCandles(string symbol, ENUM_TIMEFRAMES tf, int bars)
{
   if(StringLen(symbol) == 0) symbol = _Symbol;
   SymbolSelect(symbol, true);

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(symbol, tf, 0, bars, rates);
   if(copied <= 0)
   {
      SendLog(StringFormat("CopyRates failed for %s err=%d", symbol, GetLastError()));
      return;
   }

   string arr = "";
   for(int i = copied - 1; i >= 0; i--)   // oldest -> newest
   {
      if(StringLen(arr) > 0) arr += ",";
      arr += StringFormat(
         "{\"time\":\"%s\",\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,"
         "\"close\":%.5f,\"volume\":%I64d}",
         TimeToString(rates[i].time, TIME_DATE|TIME_SECONDS),
         rates[i].open, rates[i].high, rates[i].low, rates[i].close,
         (long)rates[i].tick_volume);
   }

   string json = StringFormat(
      "{\"type\":\"candles\",\"data\":{\"symbol\":\"%s\",\"timeframe\":\"%s\","
      "\"candles\":[%s]}}",
      symbol, TfToString(tf), arr);
   SendRaw(json);
   SendLog(StringFormat("Streamed %d candles %s %s", copied, symbol, TfToString(tf)));
}

//+------------------------------------------------------------------+
//| Minimal JSON helpers                                              |
//+------------------------------------------------------------------+
string JsonStr(const string &json, const string key)
{
   string pattern = "\"" + key + "\"";
   int pos = StringFind(json, pattern);
   if(pos < 0) return "";
   pos = StringFind(json, ":", pos);
   if(pos < 0) return "";
   pos++;
   while(pos < StringLen(json) && (StringGetCharacter(json, pos) == ' ' || StringGetCharacter(json, pos) == '\t'))
      pos++;
   if(StringGetCharacter(json, pos) != '"') return "";
   pos++;
   int end = pos;
   while(end < StringLen(json))
   {
      ushort c = StringGetCharacter(json, end);
      if(c == '"' && StringGetCharacter(json, end - 1) != '\\') break;
      end++;
   }
   return StringSubstr(json, pos, end - pos);
}

double JsonDbl(const string &json, const string key)
{
   string pattern = "\"" + key + "\"";
   int pos = StringFind(json, pattern);
   if(pos < 0) return 0;
   pos = StringFind(json, ":", pos);
   if(pos < 0) return 0;
   pos++;
   while(pos < StringLen(json) && (StringGetCharacter(json, pos) == ' ' || StringGetCharacter(json, pos) == '\t'))
      pos++;
   int end = pos;
   while(end < StringLen(json))
   {
      ushort c = StringGetCharacter(json, end);
      if((c < '0' || c > '9') && c != '.' && c != '-' && c != 'e' && c != 'E' && c != '+')
         break;
      end++;
   }
   string num = StringSubstr(json, pos, end - pos);
   return StringToDouble(num);
}

string EscapeJson(const string s)
{
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", "\\n");
   return r;
}

//+------------------------------------------------------------------+
void OnTick()
{
   // Optional: could push tick data here if needed
}
//+------------------------------------------------------------------+
