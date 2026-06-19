import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings, Building2, Calendar, CalendarDays, Clock, Bell, Shield, Save, Users, Briefcase, MapPin, DollarSign, Percent, Plus, Pencil, Trash2, FileText, LocateFixed, Loader2, Smartphone, Upload, CheckCircle2, AlertTriangle, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { fetchJson, apiRequest } from "@/lib/api";
import { DataTable } from "@/components/data-table";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/hooks/use-can";
import type { Company, Setting, MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead, StatutorySettings, TimeOfficePolicy, Holiday, WageGrade, ContractorMaster, LeavePolicy } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

export function MastersSettings({ companyId, selectedCompany, userRole }: { companyId: string | undefined; selectedCompany: string; userRole: string | undefined }) {
  const { toast } = useToast();
  const [masterTab, setMasterTab] = useState("departments");

  if (!companyId && userRole !== "super_admin") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please select a company to manage master data.
        </CardContent>
      </Card>
    );
  }

  if (selectedCompany === "__global__" && userRole === "super_admin") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please select a specific company to manage master data. Master data is company-specific.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={masterTab} onValueChange={setMasterTab}>
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="earnings">Earning Heads</TabsTrigger>
          <TabsTrigger value="deductions">Deduction Heads</TabsTrigger>
          <TabsTrigger value="wage-grades">Wage Grades</TabsTrigger>
          <TabsTrigger value="contractor-masters">Contractor Masters</TabsTrigger>
          <TabsTrigger value="leave-policies">Leave Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <DepartmentsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="designations">
          <DesignationsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="locations">
          <LocationsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="earnings">
          <EarningHeadsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="deductions">
          <DeductionHeadsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="wage-grades">
          <WageGradesManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="contractor-masters">
          <ContractorMastersManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="leave-policies">
          <LeavePoliciesManager companyId={companyId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DepartmentsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { can } = useCan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDepartment | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", description: "" });

  const { data: departments = [], isLoading } = useQuery<MasterDepartment[]>({
    queryKey: [`/api/master-departments?companyId=${companyId}`],
    queryFn: () => fetchJson<MasterDepartment[]>(`/api/master-departments${companyId ? `?companyId=${companyId}` : ''}`),
    enabled: !!companyId,
  });

  const invalidateDepts = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/master-departments") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master-departments", { ...data, companyId }),
    onSuccess: () => {
      invalidateDepts();
      toast({ title: "Department created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/master-departments/${id}`, data),
    onSuccess: () => {
      invalidateDepts();
      toast({ title: "Department updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-departments/${id}`),
    onSuccess: () => {
      invalidateDepts();
      toast({ title: "Department deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", description: "" });
    setEditingItem(null);
  };

  const handleEdit = (item: MasterDepartment) => {
    setEditingItem(item);
    setFormData({ name: item.name, code: item.code || "", description: item.description || "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Departments
            </CardTitle>
            <CardDescription>Manage company departments</CardDescription>
          </div>
          {can("masters", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-department">
            <Plus className="h-4 w-4 mr-2" />
            Add Department
          </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No departments configured. Click "Add Department" to create one.
          </div>
        ) : (
          <DataTable
            data={departments}
            rowKey={(dept) => dept.id}
            rowTestId={(dept) => `row-department-${dept.id}`}
            columns={[
              { key: "name", header: "Name", className: "font-medium", cell: (dept: MasterDepartment) => dept.name },
              { key: "code", header: "Code", cell: (dept: MasterDepartment) => dept.code || "-" },
              { key: "description", header: "Description", cell: (dept: MasterDepartment) => dept.description || "-" },
              { key: "status", header: "Status", cell: (dept: MasterDepartment) => (
                <Badge variant={dept.status === "active" ? "default" : "secondary"}>{dept.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (dept: MasterDepartment) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(dept)} data-testid={`button-edit-department-${dept.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(dept.id)} data-testid={`button-delete-department-${dept.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Department" : "Add Department"}</DialogTitle>
            <DialogDescription>Enter department details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-department-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-department-code" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} data-testid="input-department-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-department">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DesignationsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { can } = useCan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDesignation | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", level: 1, description: "" });

  const { data: designations = [], isLoading } = useQuery<MasterDesignation[]>({
    queryKey: [`/api/master-designations?companyId=${companyId}`],
    queryFn: () => fetchJson<MasterDesignation[]>(`/api/master-designations${companyId ? `?companyId=${companyId}` : ''}`),
    enabled: !!companyId,
  });

  const invalidateDesgs = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/master-designations") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master-designations", { ...data, companyId }),
    onSuccess: () => {
      invalidateDesgs();
      toast({ title: "Designation created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/master-designations/${id}`, data),
    onSuccess: () => {
      invalidateDesgs();
      toast({ title: "Designation updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-designations/${id}`),
    onSuccess: () => {
      invalidateDesgs();
      toast({ title: "Designation deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", level: 1, description: "" });
    setEditingItem(null);
  };

  const handleEdit = (item: MasterDesignation) => {
    setEditingItem(item);
    setFormData({ name: item.name, code: item.code || "", level: item.level || 1, description: item.description || "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Designations
            </CardTitle>
            <CardDescription>Manage job titles and designations</CardDescription>
          </div>
          {can("masters", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-designation">
            <Plus className="h-4 w-4 mr-2" />
            Add Designation
          </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : designations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No designations configured. Click "Add Designation" to create one.
          </div>
        ) : (
          <DataTable
            data={designations}
            rowKey={(desg) => desg.id}
            rowTestId={(desg) => `row-designation-${desg.id}`}
            columns={[
              { key: "name", header: "Name", className: "font-medium", cell: (desg: MasterDesignation) => desg.name },
              { key: "code", header: "Code", cell: (desg: MasterDesignation) => desg.code || "-" },
              { key: "level", header: "Level", cell: (desg: MasterDesignation) => desg.level },
              { key: "status", header: "Status", cell: (desg: MasterDesignation) => (
                <Badge variant={desg.status === "active" ? "default" : "secondary"}>{desg.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (desg: MasterDesignation) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(desg)} data-testid={`button-edit-designation-${desg.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(desg.id)} data-testid={`button-delete-designation-${desg.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Designation" : "Add Designation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-designation-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-designation-code" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Input id="level" type="number" value={formData.level} onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) || 1 })} data-testid="input-designation-level" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} data-testid="input-designation-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-designation">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const LOC_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir",
  "Ladakh","Lakshadweep","Puducherry"
];

const LOC_DISTRICTS: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam","Vijayawada","Guntur","Nellore","Kurnool","Kadapa","Tirupati","Anantapur","Rajahmundry","Eluru","Ongole","Vizianagaram","Srikakulam","Chittoor","Krishna","West Godavari","East Godavari"],
  "Arunachal Pradesh": ["Itanagar","Tawang","Bomdila","Ziro","Along","Pasighat","Tezu","Changlang","Tirap","Papum Pare"],
  "Assam": ["Guwahati","Dibrugarh","Jorhat","Silchar","Nagaon","Tinsukia","Kamrup","Sonitpur","Lakhimpur","Cachar","Barpeta","Dhubri","Golaghat","Sivasagar"],
  "Bihar": ["Patna","Gaya","Muzaffarpur","Bhagalpur","Darbhanga","Munger","Purnia","Arrah","Begusarai","Katihar","Nalanda","Vaishali","Madhubani","Sitamarhi","Saran","Samastipur","Rohtas","Aurangabad"],
  "Chhattisgarh": ["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Jagdalpur","Ambikapur","Raigarh","Dhamtari","Mahasamund"],
  "Goa": ["North Goa","South Goa"],
  "Gujarat": ["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Gandhinagar","Anand","Mehsana","Patan","Bharuch","Kheda","Kutch","Amreli","Junagadh","Porbandar","Banaskantha","Sabarkantha","Panchmahal","Dahod","Narmada","Tapi","Valsad","Navsari"],
  "Haryana": ["Gurugram","Faridabad","Rohtak","Ambala","Hisar","Karnal","Panipat","Sonipat","Yamunanagar","Panchkula","Bhiwani","Sirsa","Jhajjar","Jind","Mahendragarh","Rewari","Palwal","Mewat","Kaithal","Kurukshetra"],
  "Himachal Pradesh": ["Shimla","Kangra","Mandi","Solan","Kullu","Hamirpur","Una","Bilaspur","Chamba","Kinnaur","Lahaul and Spiti","Sirmaur"],
  "Jharkhand": ["Ranchi","Jamshedpur","Dhanbad","Bokaro","Hazaribagh","Deoghar","Giridih","Ramgarh","Dumka","Chaibasa","Pakur","Godda"],
  "Karnataka": ["Bengaluru","Mysuru","Hubballi","Mangaluru","Belagavi","Kalaburagi","Davanagere","Shivamogga","Tumakuru","Vijayapura","Dharwad","Udupi","Hassan","Mandya","Chitradurga","Chikkamagaluru","Kodagu","Bidar","Raichur","Koppal","Gadag","Haveri","Yadgir","Chamarajanagar","Bengaluru Rural"],
  "Kerala": ["Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam","Palakkad","Alappuzha","Malappuram","Kannur","Kasaragod","Kottayam","Idukki","Wayanad","Pathanamthitta"],
  "Madhya Pradesh": ["Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Rewa","Satna","Chhindwara","Dewas","Ratlam","Morena","Vidisha","Damoh","Katni","Shahdol","Mandsaur","Neemuch","Shivpuri","Guna","Tikamgarh","Chhatarpur","Panna","Hoshangabad","Narsinghpur","Balaghat","Seoni","Mandla","Dindori","Betul","Harda","Burhanpur","Khandwa","Khargone","Barwani","Alirajpur","Jhabua","Dhar","Rajgarh","Raisen","Sehore","Agar Malwa","Anuppur","Umaria","Ashoknagar","Bhind","Datia","Sheopur"],
  "Maharashtra": ["Mumbai","Pune","Nagpur","Thane","Nashik","Aurangabad","Solapur","Amravati","Kolhapur","Sangli","Satara","Latur","Ahmednagar","Jalgaon","Akola","Nanded","Raigad","Ratnagiri","Sindhudurg","Dhule","Nandurbar","Buldhana","Yavatmal","Washim","Hingoli","Parbhani","Osmanabad","Beed","Jalna","Wardha","Bhandara","Gondiya","Chandrapur","Gadchiroli","Mumbai Suburban"],
  "Manipur": ["Imphal West","Imphal East","Bishnupur","Thoubal","Churachandpur","Senapati","Ukhrul","Tamenglong","Jiribam","Kakching","Kangpokpi","Noney","Pherzawl","Tengnoupal"],
  "Meghalaya": ["East Khasi Hills","West Khasi Hills","South West Khasi Hills","Ri Bhoi","East Jaintia Hills","West Jaintia Hills","East Garo Hills","West Garo Hills","South Garo Hills","North Garo Hills","Eastern West Khasi Hills"],
  "Mizoram": ["Aizawl","Lunglei","Champhai","Serchhip","Kolasib","Mamit","Siaha","Lawngtlai","Saitual","Hnahthial","Khawzawl"],
  "Nagaland": ["Kohima","Dimapur","Mokokchung","Tuensang","Wokha","Zunheboto","Mon","Phek","Longleng","Kiphire","Peren"],
  "Odisha": ["Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur","Puri","Brahmapur","Balasore","Bhadrak","Baripada","Jharsuguda","Bargarh","Koraput","Rayagada","Kalahandi","Bolangir","Sundergarh","Kendujhar","Dhenkanal","Jagatsinghpur","Jajpur","Kendrapara","Khordha","Nayagarh","Ganjam","Gajapati","Malkangiri","Nabarangpur","Nuapada","Subarnapur","Angul","Deogarh"],
  "Punjab": ["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Hoshiarpur","Mohali","Ferozepur","Gurdaspur","Roopnagar","Fatehgarh Sahib","Sangrur","Faridkot","Muktsar","Mansa","Barnala","Moga","Kapurthala","Nawanshahr","Tarn Taran","Fazilka","Pathankot"],
  "Rajasthan": ["Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Alwar","Bharatpur","Sikar","Pali","Sri Ganganagar","Nagaur","Jhunjhunu","Churu","Hanumangarh","Barmer","Jaisalmer","Jalore","Sirohi","Bundi","Bhilwara","Tonk","Sawai Madhopur","Karauli","Dausa","Dholpur","Banswara","Dungarpur","Rajsamand","Chittorgarh","Baran","Jhalawar","Pratapgarh"],
  "Sikkim": ["East Sikkim","West Sikkim","North Sikkim","South Sikkim","Pakyong","Soreng"],
  "Tamil Nadu": ["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Tiruppur","Vellore","Erode","Thoothukkudi","Dindigul","Thanjavur","Ranipet","Sivaganga","Virudhunagar","Nagapattinam","Ramanathapuram","Karur","Cuddalore","Kancheepuram","Tiruvannamalai","Krishnagiri","Dharmapuri","Namakkal","Perambalur","Ariyalur","Villupuram","Kanyakumari","Nilgiris","Pudukkottai","Tiruvarur","Kallakurichi","Chengalpattu","Tenkasi"],
  "Telangana": ["Hyderabad","Warangal","Nizamabad","Karimnagar","Khammam","Ramagundam","Mahbubnagar","Nalgonda","Adilabad","Suryapet","Siddipet","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Komaram Bheem","Mahabubabad","Mancherial","Medak","Medchal","Mulugu","Nagarkurnool","Narayanpet","Nirmal","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Vikarabad","Wanaparthy","Yadadri Bhuvanagiri"],
  "Tripura": ["West Tripura","East Tripura","South Tripura","North Tripura","Gomati","Khowai","Sepahijala","Unakoti","Dhalai"],
  "Uttar Pradesh": ["Lucknow","Kanpur","Ghaziabad","Agra","Varanasi","Meerut","Prayagraj","Bareilly","Aligarh","Moradabad","Noida","Saharanpur","Gorakhpur","Faizabad","Jhansi","Mathura","Muzaffarnagar","Shahjahanpur","Firozabad","Rampur","Hapur","Etawah","Mirzapur","Bulandshahr","Sambhal","Amroha","Hardoi","Sitapur","Lakhimpur Kheri","Unnao","Rae Bareli","Jaunpur","Azamgarh","Ballia","Sultanpur","Ambedkar Nagar","Deoria","Bahraich","Basti","Gonda","Pratapgarh","Fatehpur","Banda","Chitrakoot","Hamirpur","Mahoba","Lalitpur","Etah","Mainpuri","Hathras","Kasganj","Badaun","Bijnor","Pilibhit","Kushinagar","Maharajganj","Siddharthnagar","Sant Kabir Nagar","Shravasti","Balrampur","Sonbhadra","Chandauli","Ghazipur","Mau","Sant Ravidas Nagar"],
  "Uttarakhand": ["Dehradun","Haridwar","Roorkee","Haldwani","Rudrapur","Kashipur","Rishikesh","Almora","Nainital","Pithoragarh","Bageshwar","Chamoli","Rudraprayag","Tehri Garhwal","Uttarkashi","Pauri Garhwal","Champawat","US Nagar"],
  "West Bengal": ["Kolkata","Howrah","Hooghly","North 24 Parganas","South 24 Parganas","Bardhaman","Nadia","Murshidabad","Birbhum","Bankura","Purulia","West Midnapore","East Midnapore","Jalpaiguri","Darjeeling","Alipurduar","Cooch Behar","Malda","Uttar Dinajpur","Dakshin Dinajpur","Jhargram"],
  "Delhi": ["Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi","North West Delhi","South Delhi","South East Delhi","South West Delhi","West Delhi","Shahdara"],
  "Chandigarh": ["Chandigarh"],
  "Puducherry": ["Puducherry","Karaikal","Mahe","Yanam"],
  "Jammu and Kashmir": ["Srinagar","Jammu","Anantnag","Baramulla","Budgam","Pulwama","Kupwara","Kathua","Udhampur","Reasi","Ramban","Kishtwar","Doda","Rajouri","Poonch","Shopian","Kulgam","Bandipora","Ganderbal","Samba"],
  "Ladakh": ["Leh","Kargil"],
  "Andaman and Nicobar Islands": ["South Andaman","North and Middle Andaman","Nicobar"],
  "Lakshadweep": ["Lakshadweep"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli","Daman","Diu"],
};

function LocationsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { can } = useCan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterLocation | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "", code: "", address: "", city: "", district: "", state: "", country: "India", latitude: "", longitude: ""
  });

  const districts = formData.state ? (LOC_DISTRICTS[formData.state] || []) : [];

  const { data: locations = [], isLoading } = useQuery<MasterLocation[]>({
    queryKey: [`/api/master-locations?companyId=${companyId}`],
    queryFn: () => fetchJson<MasterLocation[]>(`/api/master-locations${companyId ? `?companyId=${companyId}` : ''}`),
    enabled: !!companyId,
  });

  const invalidateLocs = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/master-locations") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master-locations", { ...data, companyId }),
    onSuccess: () => { invalidateLocs(); toast({ title: "Location created successfully" }); setDialogOpen(false); resetForm(); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/master-locations/${id}`, data),
    onSuccess: () => { invalidateLocs(); toast({ title: "Location updated successfully" }); setDialogOpen(false); resetForm(); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-locations/${id}`),
    onSuccess: () => { invalidateLocs(); toast({ title: "Location deleted successfully" }); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", address: "", city: "", district: "", state: "", country: "India", latitude: "", longitude: "" });
    setEditingItem(null);
  };

  const handleEdit = (item: MasterLocation) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code || "",
      address: item.address || "",
      city: item.city || "",
      district: (item as any).district || "",
      state: item.state || "",
      country: item.country || "India",
      latitude: (item as any).latitude || "",
      longitude: (item as any).longitude || "",
    });
    setDialogOpen(true);
  };

  const handleGeoLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGeoLoading(false);
        toast({ title: "Location captured", description: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` });
      },
      () => {
        setGeoLoading(false);
        toast({ title: "Could not get location", description: "Please allow location access or enter manually", variant: "destructive" });
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = () => {
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: formData });
    else createMutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Locations
            </CardTitle>
            <CardDescription>Manage office locations and branches</CardDescription>
          </div>
          {can("masters", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-location">
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No locations configured. Click "Add Location" to create one.
          </div>
        ) : (
          <DataTable
            data={locations}
            rowKey={(loc) => loc.id}
            rowTestId={(loc) => `row-location-${loc.id}`}
            columns={[
              { key: "name", header: "Name", className: "font-medium", cell: (loc: MasterLocation) => loc.name },
              { key: "code", header: "Code", cell: (loc: MasterLocation) => loc.code || "-" },
              { key: "city", header: "City", cell: (loc: MasterLocation) => loc.city || "-" },
              { key: "district", header: "District", cell: (loc: MasterLocation) => (loc as any).district || "-" },
              { key: "state", header: "State", cell: (loc: MasterLocation) => loc.state || "-" },
              { key: "gps", header: "GPS", cell: (loc: MasterLocation) => (
                (loc as any).latitude ? (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />Tagged
                  </span>
                ) : <span className="text-xs text-muted-foreground">-</span>
              ) },
              { key: "status", header: "Status", cell: (loc: MasterLocation) => (
                <Badge variant={loc.status === "active" ? "default" : "secondary"}>{loc.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (loc: MasterLocation) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(loc)} data-testid={`button-edit-location-${loc.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(loc.id)} data-testid={`button-delete-location-${loc.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-name">Name *</Label>
                <Input id="loc-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-location-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-code">Code</Label>
                <Input id="loc-code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-location-code" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-address">Address</Label>
              <Input id="loc-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} data-testid="input-location-address" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={formData.state} onValueChange={(v) => setFormData({ ...formData, state: v, district: "" })} data-testid="select-location-state">
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOC_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>District</Label>
                <Select value={formData.district} onValueChange={(v) => setFormData({ ...formData, district: v })} disabled={!formData.state} data-testid="select-location-district">
                  <SelectTrigger>
                    <SelectValue placeholder={formData.state ? "Select district" : "Select state first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-city">City</Label>
                <Input id="loc-city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} data-testid="input-location-city" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-country">Country</Label>
                <Input id="loc-country" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} data-testid="input-location-country" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Geo Location (Lat / Lng)</Label>
                <Button type="button" size="sm" variant="outline" onClick={handleGeoLocation} disabled={geoLoading} className="h-7 text-xs">
                  {geoLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LocateFixed className="h-3 w-3 mr-1" />}
                  {geoLoading ? "Locating..." : "Use My Location"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Latitude" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} data-testid="input-location-lat" />
                <Input placeholder="Longitude" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} data-testid="input-location-lng" />
              </div>
              {formData.latitude && formData.longitude && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {formData.latitude}, {formData.longitude}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-location">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EarningHeadsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EarningHead | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isTaxable: true, isPartOfCTC: true });

  const earningHeadsQueryKey = [`/api/earning-heads?companyId=${companyId}`];
  const { data: earningHeads = [], isLoading } = useQuery<EarningHead[]>({
    queryKey: earningHeadsQueryKey,
    queryFn: () => fetchJson<EarningHead[]>(`/api/earning-heads?companyId=${companyId}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/earning-heads", { ...data, companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningHeadsQueryKey });
      toast({ title: "Earning head created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/earning-heads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningHeadsQueryKey });
      toast({ title: "Earning head updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/earning-heads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningHeadsQueryKey });
      toast({ title: "Earning head deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isTaxable: true, isPartOfCTC: true });
    setEditingItem(null);
  };

  const handleEdit = (item: EarningHead) => {
    setEditingItem(item);
    setFormData({ 
      name: item.name, 
      code: item.code, 
      type: item.type,
      calculationBase: item.calculationBase || "",
      percentage: item.percentage || 0,
      isTaxable: item.isTaxable ?? true,
      isPartOfCTC: item.isPartOfCTC ?? true
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Earning Heads
            </CardTitle>
            <CardDescription>Manage salary earning components</CardDescription>
          </div>
          {can("settings", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-earning-head">
            <Plus className="h-4 w-4 mr-2" />
            Add Earning Head
          </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : earningHeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No earning heads configured. Click "Add Earning Head" to create one.
          </div>
        ) : (
          <DataTable
            data={earningHeads}
            rowKey={(head) => head.id}
            rowTestId={(head) => `row-earning-head-${head.id}`}
            columns={[
              { key: "name", header: "Name", className: "font-medium", cell: (head: EarningHead) => head.name },
              { key: "code", header: "Code", cell: (head: EarningHead) => head.code },
              { key: "type", header: "Type", className: "capitalize", cell: (head: EarningHead) => head.type },
              { key: "taxable", header: "Taxable", cell: (head: EarningHead) => (head.isTaxable ? "Yes" : "No") },
              { key: "ctc", header: "Part of CTC", cell: (head: EarningHead) => (head.isPartOfCTC ? "Yes" : "No") },
              { key: "status", header: "Status", cell: (head: EarningHead) => (
                <Badge variant={head.status === "active" ? "default" : "secondary"}>{head.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (head: EarningHead) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(head)} data-testid={`button-edit-earning-head-${head.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(head.id)} data-testid={`button-delete-earning-head-${head.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Earning Head" : "Add Earning Head"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-earning-head-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-earning-head-code" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger data-testid="select-earning-head-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "percentage" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="calculationBase">Calculation Base</Label>
                    <Select value={formData.calculationBase} onValueChange={(v) => setFormData({ ...formData, calculationBase: v })}>
                      <SelectTrigger data-testid="select-earning-head-base">
                        <SelectValue placeholder="Select base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="gross">Gross</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            {formData.type === "percentage" && (
              <div className="space-y-2">
                <Label htmlFor="percentage">Percentage (%)</Label>
                <Input id="percentage" type="number" value={formData.percentage} onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) || 0 })} data-testid="input-earning-head-percentage" />
              </div>
            )}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={formData.isTaxable} onCheckedChange={(v) => setFormData({ ...formData, isTaxable: v })} data-testid="switch-earning-head-taxable" />
                <Label>Taxable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.isPartOfCTC} onCheckedChange={(v) => setFormData({ ...formData, isPartOfCTC: v })} data-testid="switch-earning-head-ctc" />
                <Label>Part of CTC</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-earning-head">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DeductionHeadsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeductionHead | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isStatutory: false });

  const deductionHeadsQueryKey = [`/api/deduction-heads?companyId=${companyId}`];
  const { data: deductionHeads = [], isLoading } = useQuery<DeductionHead[]>({
    queryKey: deductionHeadsQueryKey,
    queryFn: () => fetchJson<DeductionHead[]>(`/api/deduction-heads?companyId=${companyId}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/deduction-heads", { ...data, companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deductionHeadsQueryKey });
      toast({ title: "Deduction head created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/deduction-heads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deductionHeadsQueryKey });
      toast({ title: "Deduction head updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/deduction-heads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deductionHeadsQueryKey });
      toast({ title: "Deduction head deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isStatutory: false });
    setEditingItem(null);
  };

  const handleEdit = (item: DeductionHead) => {
    setEditingItem(item);
    setFormData({ 
      name: item.name, 
      code: item.code, 
      type: item.type,
      calculationBase: item.calculationBase || "",
      percentage: item.percentage || 0,
      isStatutory: item.isStatutory ?? false
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Deduction Heads
            </CardTitle>
            <CardDescription>Manage salary deduction components</CardDescription>
          </div>
          {can("settings", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-deduction-head">
            <Plus className="h-4 w-4 mr-2" />
            Add Deduction Head
          </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : deductionHeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No deduction heads configured. Click "Add Deduction Head" to create one.
          </div>
        ) : (
          <DataTable
            data={deductionHeads}
            rowKey={(head) => head.id}
            rowTestId={(head) => `row-deduction-head-${head.id}`}
            columns={[
              { key: "name", header: "Name", className: "font-medium", cell: (head: DeductionHead) => head.name },
              { key: "code", header: "Code", cell: (head: DeductionHead) => head.code },
              { key: "type", header: "Type", className: "capitalize", cell: (head: DeductionHead) => head.type },
              { key: "statutory", header: "Statutory", cell: (head: DeductionHead) => (head.isStatutory ? "Yes" : "No") },
              { key: "status", header: "Status", cell: (head: DeductionHead) => (
                <Badge variant={head.status === "active" ? "default" : "secondary"}>{head.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (head: DeductionHead) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(head)} data-testid={`button-edit-deduction-head-${head.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(head.id)} data-testid={`button-delete-deduction-head-${head.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Deduction Head" : "Add Deduction Head"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-deduction-head-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-deduction-head-code" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger data-testid="select-deduction-head-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "percentage" && (
                <div className="space-y-2">
                  <Label htmlFor="calculationBase">Calculation Base</Label>
                  <Select value={formData.calculationBase} onValueChange={(v) => setFormData({ ...formData, calculationBase: v })}>
                    <SelectTrigger data-testid="select-deduction-head-base">
                      <SelectValue placeholder="Select base" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="gross">Gross</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {formData.type === "percentage" && (
              <div className="space-y-2">
                <Label htmlFor="percentage">Percentage (%)</Label>
                <Input id="percentage" type="number" value={formData.percentage} onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) || 0 })} data-testid="input-deduction-head-percentage" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={formData.isStatutory} onCheckedChange={(v) => setFormData({ ...formData, isStatutory: v })} data-testid="switch-deduction-head-statutory" />
              <Label>Statutory Deduction</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-deduction-head">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


function WageGradesManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { can } = useCan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WageGrade | null>(null);
  const [formData, setFormData] = useState({ name: "", state: "", minimumWage: "", effectiveFrom: "" });
  const GRADE_OPTIONS = ["Unskilled", "Semi-Skilled", "Skilled", "Highly-Skilled"] as const;
  const STATE_OPTIONS = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Delhi", "Jammu & Kashmir", "Ladakh", "Puducherry",
    "Chandigarh", "Andaman & Nicobar", "Dadra & Nagar Haveli", "Lakshadweep"
  ];

  const { data: grades = [], isLoading } = useQuery<WageGrade[]>({
    queryKey: [`/api/wage-grades?companyId=${companyId}`],
    queryFn: () => fetchJson<WageGrade[]>(`/api/wage-grades${companyId ? `?companyId=${companyId}` : ''}`),
    enabled: !!companyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/wage-grades") });
  };

  const parseApiError = (error: Error): string => {
    try {
      const json = JSON.parse(error.message.replace(/^\d+: /, ""));
      return json.error || json.message || error.message;
    } catch { return error.message; }
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/wage-grades", { ...data, companyId }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Wage grade created" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Cannot create wage grade", description: parseApiError(error), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/wage-grades/${id}`, data),
    onSuccess: () => {
      invalidate();
      toast({ title: "Wage grade updated" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/wage-grades/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Wage grade deleted" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", state: "", minimumWage: "", effectiveFrom: "" });
    setEditingItem(null);
  };

  const handleSubmit = () => {
    const wage = parseInt(formData.minimumWage, 10);
    if (!formData.name) {
      toast({ title: "Please select a grade", variant: "destructive" });
      return;
    }
    if (!formData.state) {
      toast({ title: "Please select a state", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(wage) || wage <= 0) {
      toast({ title: "Minimum wage must be greater than zero", variant: "destructive" });
      return;
    }
    if (!formData.effectiveFrom) {
      toast({ title: "Please pick an effective-from date", variant: "destructive" });
      return;
    }
    const payload = {
      name: formData.name,
      state: formData.state,
      minimumWage: wage,
      effectiveFrom: formData.effectiveFrom,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (g: WageGrade) => {
    setEditingItem(g);
    setFormData({
      name: g.name,
      state: g.state || "",
      minimumWage: String(g.minimumWage),
      effectiveFrom: g.effectiveFrom || "",
    });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Wage Grades</CardTitle>
          <CardDescription>Define minimum-wage grades for this company</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          {can("masters", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-wage-grade">
            <Plus className="h-4 w-4 mr-2" /> Add
          </Button>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Wage Entry" : "Add Wage Entry"}</DialogTitle>
              <DialogDescription>Pick a grade and set its minimum wage from the chosen effective date.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Grade *</Label>
                <Select value={formData.name} onValueChange={(v) => setFormData({ ...formData, name: v })}>
                  <SelectTrigger data-testid="select-wage-grade-name">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>State *</Label>
                <Select value={formData.state} onValueChange={(v) => setFormData({ ...formData, state: v })}>
                  <SelectTrigger data-testid="select-wage-grade-state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATE_OPTIONS.map((st) => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Minimum Wage (INR) *</Label>
                <Input type="number" min="1" value={formData.minimumWage} onChange={(e) => setFormData({ ...formData, minimumWage: e.target.value })} placeholder="e.g. 18000" data-testid="input-wage-grade-min" />
              </div>
              <div>
                <Label>Effective From *</Label>
                <Input type="date" value={formData.effectiveFrom} onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })} data-testid="input-wage-grade-effective" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-wage-grade">
                {editingItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : grades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No wage grades yet. Click "Add Wage Grade" to create one.</div>
        ) : (
          <DataTable
            data={[...grades].sort((a, b) => {
              const nameCmp = a.name.localeCompare(b.name);
              if (nameCmp !== 0) return nameCmp;
              return (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? "");
            })}
            rowKey={(g) => g.id}
            rowTestId={(g) => `row-wage-grade-${g.id}`}
            rowClassName={(g) => g.status === "closed" ? "opacity-60" : ""}
            columns={[
              { key: "name", header: "Grade", className: "font-medium", cell: (g: WageGrade) => g.name },
              { key: "state", header: "State", cell: (g: WageGrade) => g.state || "—" },
              { key: "minimumWage", header: "Minimum Wage (INR)", cell: (g: WageGrade) => `₹${g.minimumWage.toLocaleString("en-IN")}` },
              { key: "effectiveFrom", header: "Effective From", cell: (g: WageGrade) => g.effectiveFrom || "—" },
              { key: "effectiveTo", header: "Effective To", cell: (g: WageGrade) => g.effectiveTo || <span className="text-muted-foreground text-xs">Ongoing</span> },
              { key: "status", header: "Status", cell: (g: WageGrade) => (
                <Badge variant={g.status === "active" ? "default" : "secondary"}
                  className={g.status === "closed" ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" : ""}>
                  {g.status}
                </Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-32", cell: (g: WageGrade) => (
                <>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(g)} disabled={g.status === "closed"} data-testid={`button-edit-wage-grade-${g.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete wage grade "${g.name}"?`)) deleteMutation.mutate(g.id); }} data-testid={`button-delete-wage-grade-${g.id}`}><Trash2 className="h-4 w-4" /></Button>
                </>
              ) },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

const COMPLIANCE_OPTIONS = ["PF", "ESI", "PT", "LWF", "TDS", "Minimum Wages", "Bonus", "Gratuity"];

function LeavePoliciesManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { can } = useCan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LeavePolicy | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    annualLeaveDays: 0,
    sickLeaveDays: 0,
    casualLeaveDays: 0,
    maternityLeaveDays: 0,
    paternityLeaveDays: 0,
    status: "active",
  });

  const { data: records = [], isLoading } = useQuery<LeavePolicy[]>({
    queryKey: [`/api/leave-policies?companyId=${companyId}`],
    queryFn: () => fetchJson<LeavePolicy[]>(`/api/leave-policies?companyId=${companyId}`),
    enabled: !!companyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/leave-policies") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/leave-policies", { ...data, companyId }),
    onSuccess: () => { invalidate(); toast({ title: "Leave policy created" }); setDialogOpen(false); resetForm(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/leave-policies/${id}`, data),
    onSuccess: () => { invalidate(); toast({ title: "Leave policy updated" }); setDialogOpen(false); resetForm(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/leave-policies/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Leave policy deleted" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", annualLeaveDays: 0, sickLeaveDays: 0, casualLeaveDays: 0, maternityLeaveDays: 0, paternityLeaveDays: 0, status: "active" });
    setEditingItem(null);
  };

  const handleEdit = (item: LeavePolicy) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      annualLeaveDays: item.annualLeaveDays ?? 0,
      sickLeaveDays: item.sickLeaveDays ?? 0,
      casualLeaveDays: item.casualLeaveDays ?? 0,
      maternityLeaveDays: item.maternityLeaveDays ?? 0,
      paternityLeaveDays: item.paternityLeaveDays ?? 0,
      status: item.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Policy Name is required", variant: "destructive" });
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Leave Policies
            </CardTitle>
            <CardDescription>Define leave entitlements per policy and assign them to employees</CardDescription>
          </div>
          {can("masters", "edit") && (
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-leave-policy">
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No leave policies configured. Click "Add Policy" to create one.</div>
        ) : (
          <DataTable
            data={records}
            rowKey={(r) => r.id}
            rowTestId={(r) => `row-leave-policy-${r.id}`}
            columns={[
              { key: "name", header: "Policy Name", className: "font-medium", cell: (r: LeavePolicy) => (
                <>
                  <div>{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </>
              ) },
              { key: "annual", header: "Annual", cell: (r: LeavePolicy) => `${r.annualLeaveDays} days` },
              { key: "sick", header: "Sick", cell: (r: LeavePolicy) => `${r.sickLeaveDays} days` },
              { key: "casual", header: "Casual", cell: (r: LeavePolicy) => `${r.casualLeaveDays} days` },
              { key: "maternity", header: "Maternity", cell: (r: LeavePolicy) => `${r.maternityLeaveDays} days` },
              { key: "paternity", header: "Paternity", cell: (r: LeavePolicy) => `${r.paternityLeaveDays} days` },
              { key: "status", header: "Status", cell: (r: LeavePolicy) => (
                <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (r: LeavePolicy) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(r)} data-testid={`button-edit-leave-policy-${r.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${r.name}"?`)) deleteMutation.mutate(r.id); }} data-testid={`button-delete-leave-policy-${r.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Leave Policy" : "Add Leave Policy"}</DialogTitle>
            <DialogDescription>Set the number of leave days for each type in this policy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="policyName">Policy Name *</Label>
              <Input id="policyName" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Standard Policy" data-testid="input-leave-policy-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policyDesc">Description</Label>
              <Input id="policyDesc" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description" data-testid="input-leave-policy-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="annualDays">Annual Leave (days)</Label>
                <Input id="annualDays" type="number" min={0} value={formData.annualLeaveDays} onChange={(e) => setFormData({ ...formData, annualLeaveDays: parseInt(e.target.value) || 0 })} data-testid="input-annual-leave-days" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sickDays">Sick Leave (days)</Label>
                <Input id="sickDays" type="number" min={0} value={formData.sickLeaveDays} onChange={(e) => setFormData({ ...formData, sickLeaveDays: parseInt(e.target.value) || 0 })} data-testid="input-sick-leave-days" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="casualDays">Casual Leave (days)</Label>
                <Input id="casualDays" type="number" min={0} value={formData.casualLeaveDays} onChange={(e) => setFormData({ ...formData, casualLeaveDays: parseInt(e.target.value) || 0 })} data-testid="input-casual-leave-days" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maternityDays">Maternity Leave (days)</Label>
                <Input id="maternityDays" type="number" min={0} value={formData.maternityLeaveDays} onChange={(e) => setFormData({ ...formData, maternityLeaveDays: parseInt(e.target.value) || 0 })} data-testid="input-maternity-leave-days" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paternityDays">Paternity Leave (days)</Label>
                <Input id="paternityDays" type="number" min={0} value={formData.paternityLeaveDays} onChange={(e) => setFormData({ ...formData, paternityLeaveDays: parseInt(e.target.value) || 0 })} data-testid="input-paternity-leave-days" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyStatus">Status</Label>
                <select id="policyStatus" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" data-testid="select-leave-policy-status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-leave-policy">
              {createMutation.isPending || updateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{editingItem ? "Updating..." : "Creating..."}</>
              ) : (
                editingItem ? "Update" : "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ContractorMastersManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { can } = useCan();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractorMaster | null>(null);
  const [formData, setFormData] = useState({
    contractorName: "",
    contractorAddress: "",
    serviceChargePercent: 0,
    applicableCompliances: [] as string[],
  });

  const { data: records = [], isLoading } = useQuery<ContractorMaster[]>({
    queryKey: [`/api/contractor-masters?companyId=${companyId}`],
    queryFn: () => fetchJson<ContractorMaster[]>(`/api/contractor-masters?companyId=${companyId}`),
    enabled: !!companyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/contractor-masters") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/contractor-masters", { ...data, companyId }),
    onSuccess: () => { invalidate(); toast({ title: "Contractor master created" }); setDialogOpen(false); resetForm(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/contractor-masters/${id}`, data),
    onSuccess: () => { invalidate(); toast({ title: "Contractor master updated" }); setDialogOpen(false); resetForm(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contractor-masters/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Contractor master deleted" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ contractorName: "", contractorAddress: "", serviceChargePercent: 0, applicableCompliances: [] });
    setEditingItem(null);
  };

  const handleEdit = (item: ContractorMaster) => {
    setEditingItem(item);
    setFormData({
      contractorName: item.contractorName,
      contractorAddress: item.contractorAddress || "",
      serviceChargePercent: item.serviceChargePercent ?? 0,
      applicableCompliances: item.applicableCompliances ?? [],
    });
    setDialogOpen(true);
  };

  const toggleCompliance = (c: string) => {
    setFormData((prev) => ({
      ...prev,
      applicableCompliances: prev.applicableCompliances.includes(c)
        ? prev.applicableCompliances.filter((x) => x !== c)
        : [...prev.applicableCompliances, c],
    }));
  };

  const handleSubmit = () => {
    if (!formData.contractorName.trim()) {
      toast({ title: "Contractor Name is required", variant: "destructive" });
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Contractor Masters
            </CardTitle>
            <CardDescription>Manage contractor details, service charges and applicable compliances</CardDescription>
          </div>
          {can("masters", "edit") && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-contractor-master">
            <Plus className="h-4 w-4 mr-2" />
            Add Contractor
          </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No contractors configured. Click "Add Contractor" to create one.
          </div>
        ) : (
          <DataTable
            data={records}
            rowKey={(r) => r.id}
            rowTestId={(r) => `row-contractor-master-${r.id}`}
            columns={[
              { key: "contractorName", header: "Contractor Name", className: "font-medium", cell: (r: ContractorMaster) => r.contractorName },
              { key: "contractorAddress", header: "Address", className: "max-w-[200px] truncate", cell: (r: ContractorMaster) => r.contractorAddress || "-" },
              { key: "serviceChargePercent", header: "Service Charge %", cell: (r: ContractorMaster) => r.serviceChargePercent != null ? `${r.serviceChargePercent}%` : "-" },
              { key: "applicableCompliances", header: "Applicable Compliances", cell: (r: ContractorMaster) => (
                <div className="flex flex-wrap gap-1">
                  {(r.applicableCompliances ?? []).length > 0
                    ? (r.applicableCompliances ?? []).map((c) => <Badge key={c} variant="secondary">{c}</Badge>)
                    : <span className="text-muted-foreground">-</span>}
                </div>
              ) },
              { key: "status", header: "Status", cell: (r: ContractorMaster) => (
                <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
              ) },
              { key: "actions", header: "Actions", headClassName: "w-24", cell: (r: ContractorMaster) => (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(r)} data-testid={`button-edit-contractor-master-${r.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${r.contractorName}"?`)) deleteMutation.mutate(r.id); }} data-testid={`button-delete-contractor-master-${r.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) },
            ]}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Contractor" : "Add Contractor"}</DialogTitle>
            <DialogDescription>Enter contractor details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contractorName">Contractor Name *</Label>
              <Input
                id="contractorName"
                value={formData.contractorName}
                onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
                placeholder="Enter contractor name"
                data-testid="input-contractor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractorAddress">Contractor Address</Label>
              <Textarea
                id="contractorAddress"
                value={formData.contractorAddress}
                onChange={(e) => setFormData({ ...formData, contractorAddress: e.target.value })}
                placeholder="Enter contractor address"
                rows={3}
                data-testid="input-contractor-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceCharge">Service Charge %</Label>
              <Input
                id="serviceCharge"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={formData.serviceChargePercent}
                onChange={(e) => setFormData({ ...formData, serviceChargePercent: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                data-testid="input-service-charge"
              />
            </div>
            <div className="space-y-2">
              <Label>Applicable Compliances</Label>
              <div className="grid grid-cols-2 gap-2">
                {COMPLIANCE_OPTIONS.map((c) => (
                  <label key={c} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.applicableCompliances.includes(c)}
                      onChange={() => toggleCompliance(c)}
                      data-testid={`checkbox-compliance-${c.toLowerCase().replace(/\s/g, "-")}`}
                      className="h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                    <span className="text-sm">{c}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-contractor-master"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{editingItem ? "Updating..." : "Creating..."}</>
              ) : (
                editingItem ? "Update" : "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


