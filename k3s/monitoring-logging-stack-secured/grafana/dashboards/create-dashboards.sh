## Node Exporter dashboard
kubectl create configmap grafana-dashboard-node-exporter  --from-file=raw-dashboards-files/node-exporter-dashboard.json -n monitoring

## Kube state metrics dashboard || For cluster components monitoring
kubectl create configmap grafana-dashboard-kube-state-metrics  --from-file=raw-dashboards-files/kube-state-metrics-dashboard.json -n monitoring

##Black box exporter dashboard
kubectl create configmap grafana-dashboard-blackbox-exporter --from-file=raw-dashboards-files/blackbox-exporter-dashboard.json -n monitoring

## APM dashboard 
kubectl create configmap grafana-dashboard-backend-prod --from-file=raw-dashboards-files/backend-prod-apm-dashboard.json -n monitoring

