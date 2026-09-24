import Link from "next/link";
import { RefreshCw, FileSpreadsheet, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ProductImportPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Products</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose how to bring product data into the database. Products must exist here before they can be added to a pricing project.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:border-blue-200 transition-colors">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle className="text-base">Salsify Sync</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Pull product data from your Salsify catalog using your field mapping and API key.
            </p>
            <Link href="/products/import/salsify">
              <Button className="w-full">Sync from Salsify</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-blue-200 transition-colors">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center mb-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
            </div>
            <CardTitle className="text-base">Spreadsheet Import</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Upload a spreadsheet with full product data including SKUs, costs, and channel prices.
            </p>
            <Link href="/products/import/spreadsheet">
              <Button variant="outline" className="w-full">Upload Spreadsheet</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-blue-200 transition-colors">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center mb-2">
              <Upload className="h-5 w-5 text-purple-600" />
            </div>
            <CardTitle className="text-base">Supplemental Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              Update cost and MCF freight data for products already in the database.
            </p>
            <Link href="/products/import/supplemental">
              <Button variant="outline" className="w-full">Import Supplemental</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
