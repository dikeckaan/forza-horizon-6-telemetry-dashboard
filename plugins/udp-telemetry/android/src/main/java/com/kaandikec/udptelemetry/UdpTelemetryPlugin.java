package com.kaandikec.udptelemetry;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/** Listens for Forza "Data Out" datagrams and forwards each one to JS as base64. */
@CapacitorPlugin(name = "UdpTelemetry")
public class UdpTelemetryPlugin extends Plugin {

    private DatagramSocket socket;
    private Thread worker;
    private volatile boolean running;

    @PluginMethod
    public void start(PluginCall call) {
        int port = call.getInt("port", 20440);
        stopInternal();
        try {
            DatagramSocket s = new DatagramSocket(null);
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(port));
            socket = s;
        } catch (Exception e) {
            call.reject("UDP port " + port + " could not be opened: " + e.getMessage());
            return;
        }
        running = true;
        final DatagramSocket s = socket;
        worker = new Thread(
            () -> {
                byte[] buf = new byte[2048];
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                while (running) {
                    try {
                        p.setLength(buf.length);
                        s.receive(p);
                        JSObject ev = new JSObject();
                        ev.put("data", Base64.encodeToString(buf, 0, p.getLength(), Base64.NO_WRAP));
                        ev.put("from", p.getAddress().getHostAddress() + ":" + p.getPort());
                        notifyListeners("packet", ev);
                    } catch (Exception e) {
                        if (!running) break;
                    }
                }
            },
            "udp-telemetry"
        );
        worker.start();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    @PluginMethod
    public void getAddresses(PluginCall call) {
        JSArray list = new JSArray();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (a instanceof Inet4Address) list.put(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {
            // no interfaces available: return an empty list
        }
        JSObject ret = new JSObject();
        ret.put("addresses", list);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
    }

    private void stopInternal() {
        running = false;
        if (socket != null) {
            socket.close();
            socket = null;
        }
        worker = null;
    }
}
